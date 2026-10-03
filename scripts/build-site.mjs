import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyComparison} from './build-comparison.mjs';
import {prepareBenchmarkSite,verifyPerformance} from './lib/runtime-bench.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
verifyComparison(root);
verifyPerformance(root);
const output=join(root,'_site');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(join(root,'site'),output,{recursive:true});
await prepareBenchmarkSite(root,output);
await writeFile(join(output,'.nojekyll'),'');
console.log(`Built current objective comparisons at ${output}`);

await import('./package-download.mjs').then(({writePackageDownload}) => writePackageDownload(root, output));
