import {build} from 'esbuild';
await build({entryPoints:['src/app.js'],bundle:true,format:'iife',outfile:'app.js',minify:true,sourcemap:true,target:['es2022'],legalComments:'eof'});
