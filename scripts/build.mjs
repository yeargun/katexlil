import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildPackage} from './compiler-package.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
if(process.argv.includes('--map')) throw Error('Configure delivery.source_maps="hidden" in lilscript.toml for attribution builds.')
const contrib=['auto-render','copy-tex','mathtex-script-type','mhchem','render-a11y-string']
await buildPackage({root,
  profiles:[{name:'public',config:'lilscript.toml'},{name:'closed',config:'lilscript.closed.toml'},...contrib.map(name=>({name,config:`config/${name}.toml`}))],
  aliases:{'katex.raw.js':'katex.esm.js','katex.mjs':'katex.esm.js','katex.min.js':'katex.umd.js','katex.test.raw.js':'katex.test.js','katex.closed.raw.js':'katex.closed.js'},
  assets:[{source:'assets/katex.css',destination:'katex.css'},{source:'assets/katex.min.css',destination:'katex.min.css'},{source:'fonts',destination:'fonts'},{source:'types/katex.d.ts',destination:'katex.d.ts'}]})
