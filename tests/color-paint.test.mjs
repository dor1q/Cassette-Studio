import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePaint,paintLuminance,isPaintDark,autoPaintColor,paintFallbackColor,svgPaint} from '../src/color-paint.js';

test('reference URL colors normalize while automatic and transparent markers remain serializable',()=>{
 assert.equal(normalizePaint('F80'),'#ff8800');
 assert.equal(normalizePaint(' #131139 '),'#131139');
 assert.equal(normalizePaint('rainbow'),'rainbow');
 assert.equal(normalizePaint('clear'),'transparent');
 assert.equal(normalizePaint('transparent'),'transparent');
 const saved=JSON.parse(JSON.stringify({fg:normalizePaint('rainbow'),color:normalizePaint('rainbow')}));
 assert.deepEqual(saved,{fg:'rainbow',color:'rainbow'});
});

test('automatic color uses the original weighted-RGB threshold rather than a rainbow gradient',()=>{
 assert.equal(autoPaintColor('#131139'),'#ffffff');
 assert.equal(autoPaintColor('#f9f3ea'),'#000000');
 assert.equal(autoPaintColor('#656565'),'#ffffff');
 // Original arithmetic rounds this borderline gray slightly below .4.
 assert.equal(autoPaintColor('#666666'),'#ffffff');
 assert.equal(autoPaintColor('#676767'),'#000000');
 assert.equal(isPaintDark('#000000'),true);
 assert.equal(isPaintDark('#ffffff'),false);
 assert.equal(paintLuminance('#000000'),0);
 assert.equal(paintLuminance('#ffffff'),1);
 // The original weights make green brighter than red or blue.
 assert.equal(autoPaintColor('#00ff00'),'#000000');
 assert.equal(autoPaintColor('#ff0000'),'#ffffff');
 assert.equal(autoPaintColor('#0000ff'),'#ffffff');
});

test('the same saved automatic marker resolves separately for A, B and inner surface colors',()=>{
 const saved='rainbow';
 const colors=['#131139','#f9f3ea','#101010'];
 const rendered=colors.map((backgroundColor,i)=>svgPaint(saved,'text-'+i,{backgroundColor}));
 assert.deepEqual(rendered,[{fill:'#ffffff',defs:''},{fill:'#000000',defs:''},{fill:'#ffffff',defs:''}]);
 assert.equal(saved,'rainbow');
 assert.deepEqual(svgPaint('rainbow','legacy-option',{background:'#131139'}),{fill:'#ffffff',defs:''});
});

test('transparent or unknown backgrounds are neutral for original automatic text',()=>{
 for(const background of [undefined,null,'','rainbow','transparent','clear','invalid']){
  assert.equal(isPaintDark(background),false);
  assert.equal(paintLuminance(background),.5);
  assert.equal(autoPaintColor(background),'#000000');
 }
 assert.deepEqual(svgPaint('clear','cutout'),{fill:'transparent',defs:''});
});

test('color-input fallback stays hex while rendering preserves transparent paint',()=>{
 assert.equal(paintFallbackColor('rainbow','#ff0000','#131139'),'#ffffff');
 assert.equal(paintFallbackColor('rainbow','#ff0000','#f9f3ea'),'#000000');
 assert.equal(paintFallbackColor('transparent','#abc'),'#aabbcc');
 assert.equal(paintFallbackColor('transparent','rainbow'),'#000000');
 assert.equal(paintFallbackColor('F80'),'#ff8800');
 assert.equal(paintFallbackColor(undefined,'#f00'),'#ff0000');
 assert.deepEqual(svgPaint('#f00','own-color',{backgroundColor:'#131139'}),{fill:'#ff0000',defs:''});
});

test('unsupported gradients and CSS references cannot introduce SVG definitions or attributes',()=>{
 const unsafe=['linear-gradient(90deg,red,blue)','radial-gradient(red,blue)','url(#external)',
  'url(https://example.com/image.svg)','red','rgba(0,0,0,0.5)','12345678',
  '#fff\"/><script>alert(1)</script>',{color:'#ff0000'},42,null];
 for(const value of unsafe){
  assert.equal(normalizePaint(value,'#123456'),'#123456');
  assert.deepEqual(svgPaint(value,'\" onload=\"alert(1)',{fallback:'#123456'}),{fill:'#123456',defs:''});
 }
 assert.equal(normalizePaint('invalid','url(evil)'),'#000000');
 assert.deepEqual(svgPaint('invalid','id',null),{fill:'#000000',defs:''});
});
