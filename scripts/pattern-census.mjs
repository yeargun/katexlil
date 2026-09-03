import {parse} from '@babel/parser';
import _traverse from '@babel/traverse';
import fs from 'fs';
const traverse = _traverse.default ?? _traverse;

const isIdent = s => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) &&
  !['null','true','false'].includes(s);

export function census(code, label) {
  const ast = parse(code, {sourceType:'unambiguous', errorRecovery:true});
  const c = {};
  const bump = (k, n=1) => c[k] = (c[k]||0)+n;
  traverse(ast, {
    BooleanLiteral(p){ bump('bool-literal-true-false'); },
    MemberExpression(p){
      const n = p.node;
      if (n.computed && n.property.type==='StringLiteral' && isIdent(n.property.value))
        bump('computed-string-key-could-be-dotted');
    },
    ObjectProperty(p){
      const n = p.node;
      if (!n.computed && n.key.type==='StringLiteral' && isIdent(n.key.value))
        bump('quoted-object-key-could-be-bare');
      if (!n.computed && !n.shorthand && n.key.type==='Identifier' &&
          n.value.type==='Identifier' && n.key.name===n.value.name)
        bump('object-prop-could-be-shorthand');
    },
    FunctionExpression(p){ if (p.node.id) bump('named-function-expression'); },
    ClassExpression(p){ if (p.node.id) bump('named-class-expression'); },
    ReturnStatement(p){
      const a = p.node.argument;
      if (a && (a.type==='Identifier'&&a.name==='undefined'))  bump('return-undefined');
      if (a && a.type==='UnaryExpression' && a.operator==='void') bump('return-void-0');
    },
    UnaryExpression(p){
      const n=p.node;
      if (n.operator==='typeof') bump('typeof-any');
      if (n.operator==='!' && n.argument.type==='BinaryExpression' &&
          ['===','==','!==','!=','<','>','<=','>='].includes(n.argument.operator))
        bump('not-of-comparison');
      if (n.operator==='!' && n.argument.type==='UnaryExpression' && n.argument.operator==='!')
        bump('double-negation');
    },
    BinaryExpression(p){
      const n=p.node;
      const und = x => (x.type==='Identifier'&&x.name==='undefined') ||
                       (x.type==='UnaryExpression'&&x.operator==='void');
      if ((n.operator==='==='||n.operator==='!==') && (und(n.left)||und(n.right)))
        bump('strict-eq-undefined');
      if ((n.operator==='==='||n.operator==='!==') &&
          (n.left.type==='NullLiteral'||n.right.type==='NullLiteral'))
        bump('strict-eq-null');
      if (n.operator==='+' && n.left.type==='StringLiteral' && n.right.type==='StringLiteral')
        bump('adjacent-string-concat');
    },
    LogicalExpression(p){
      const n=p.node;
      const isNullCmp = (x,op) => x.type==='BinaryExpression' && x.operator===op &&
        (x.left.type==='NullLiteral'||x.right.type==='NullLiteral' ||
         (x.left.type==='Identifier'&&x.left.name==='undefined') ||
         (x.right.type==='Identifier'&&x.right.name==='undefined'));
      if (n.operator==='||' && isNullCmp(n.left,'===') && isNullCmp(n.right,'==='))
        bump('null-or-undefined-pair-could-be-loose');
    },
    NewExpression(p){
      const cal=p.node.callee;
      if (cal.type==='Identifier' && ['Object','Array','String','Number','Boolean','RegExp'].includes(cal.name))
        bump('new-builtin-could-be-literal');
    },
    SequenceExpression(p){ bump('sequence-expression'); },
    IfStatement(p){
      const n=p.node;
      const isExpr = s => s && s.type==='ExpressionStatement';
      const isBlockOne = s => s && s.type==='BlockStatement' && s.body.length===1;
      if (!n.alternate && (isExpr(n.consequent) || (isBlockOne(n.consequent)&&isExpr(n.consequent.body[0]))))
        bump('if-no-else-single-expr-could-be-logical');
      if (n.alternate && isExpr(n.consequent) && isExpr(n.alternate))
        bump('if-else-both-expr-could-be-ternary');
      if (n.alternate && n.consequent.type==='ReturnStatement' && n.alternate.type==='ReturnStatement')
        bump('if-else-both-return-could-be-ternary');
      if (n.consequent.type==='BlockStatement') bump('if-consequent-is-block');
    },
    BlockStatement(p){
      const b=p.node.body;
      let runs=0;
      for(let i=0;i+1<b.length;i++)
        if(b[i].type==='ExpressionStatement'&&b[i+1].type==='ExpressionStatement') runs++;
      if(runs) bump('adjacent-expr-statements', runs);
      let vruns=0;
      for(let i=0;i+1<b.length;i++)
        if(b[i].type==='VariableDeclaration'&&b[i+1].type==='VariableDeclaration'&&
           b[i].kind===b[i+1].kind) vruns++;
      if(vruns) bump('adjacent-var-declarations', vruns);
    },
    VariableDeclaration(p){
      if (p.node.kind==='let') bump('let-declaration');
      if (p.node.kind==='const') bump('const-declaration');
      if (p.node.kind==='var') bump('var-declaration');
      if (p.node.declarations.length===1 && !p.node.declarations[0].init)
        bump('single-uninitialized-declarator');
    },
    TemplateLiteral(p){ bump('template-literal'); },
    ArrowFunctionExpression(p){
      const n=p.node;
      if (n.body.type==='BlockStatement' && n.body.body.length===1 &&
          n.body.body[0].type==='ReturnStatement' && n.body.body[0].argument)
        bump('arrow-block-could-be-concise');
    },
    StringLiteral(p){
      const v=p.node.value;
      const dq=(v.match(/"/g)||[]).length, sq=(v.match(/'/g)||[]).length;
      if (dq>sq) bump('string-suboptimal-quote-maybe');
    },
    ThrowStatement(p){ bump('throw-statement'); },
    ConditionalExpression(p){
      const n=p.node;
      if (n.consequent.type==='BooleanLiteral' && n.alternate.type==='BooleanLiteral')
        bump('ternary-of-booleans');
      const same = JSON.stringify(gen(n.consequent))===JSON.stringify(gen(n.alternate));
      if (same) bump('ternary-identical-arms');
    },
  });
  return c;
}
function gen(n){ return {t:n.type, n:n.name, v:n.value}; }

const files = process.argv.slice(2);
const tables = files.map(f => [f, census(fs.readFileSync(f,'utf8'), f)]);
const keys = [...new Set(tables.flatMap(([,t])=>Object.keys(t)))].sort();
const names = tables.map(([f])=>f.split('/').pop().slice(0,24));
console.log('pattern'.padEnd(46) + names.map(n=>n.padStart(26)).join(''));
for (const k of keys) {
  const row = tables.map(([,t])=>String(t[k]||0).padStart(26));
  console.log(k.padEnd(46) + row.join(''));
}
