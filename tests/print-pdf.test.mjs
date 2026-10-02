import test from 'node:test';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {Resvg} from '@resvg/resvg-js';
import {printLayout} from '../src/print-layout.js';
import {writePrintPages} from '../src/print-pdf.js';

const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').render().asPng();
const canvas={toDataURL:()=> 'data:image/png;base64,'+png.toString('base64')};

test('twelve-up PDF applies a separate clipping boundary to every label with bleed',()=>{
 const items=[{w:92.6,h:45.8,canvas},{w:92.6,h:45.8,canvas}],plan=printLayout(items,{mode:'label',sheet:'12up',copies:6,bleed:2});
 const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],compress:false});writePrintPages(doc,items,plan);
 const output=doc.output();assert.equal(doc.getNumberOfPages(),1);
 assert.equal((output.match(/\nW\nn\n/g)||[]).length,12);
 assert.equal((output.match(/\/I\d+ Do/g)||[]).length,12);
 const commands=output.split('\n');assert.equal(commands.filter(x=>x==='q').length,commands.filter(x=>x==='Q').length);
});

test('two-up duplex PDF produces all page pairs and rotates only reverse images',()=>{
 const items=[{w:168,h:102,canvas},{w:168,h:102,canvas}],plan=printLayout(items,{sheet:'2up',copies:3,duplexFlip:'short'});
 const doc=new jsPDF({unit:'mm',format:[plan.w,plan.h],compress:false});let rotations=0;
 writePrintPages(doc,items,plan,source=>{rotations++;return source});
 assert.equal(doc.getNumberOfPages(),4);assert.equal(rotations,3);
 assert.equal((doc.output().match(/\/I\d+ Do/g)||[]).length,6);
});
