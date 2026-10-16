import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJCardMarkdown} from '../src/jcard-markdown.js';

const text=block=>block.glyphs.map(glyph=>glyph.text).join('');
const allBlocks=result=>{const blocks=[],pending=[...result.blocks];while(pending.length){const block=pending.pop();blocks.push(block);pending.push(...block.children)}return blocks};

test('J-card Markdown preserves nested emphasis, underscores, escapes, entities and literal code',()=>{
 const source='***Both*** __Bold *inside*__ _Italic **nested**_ \\*literal\\* &amp; &#x1F3B5; `**code** &amp;`';
 const result=parseJCardMarkdown(source),block=result.blocks[0];
 assert.equal(text(block),'Both Bold inside Italic nested *literal* & 🎵 **code** &amp;');
 const word=value=>{const start=text(block).indexOf(value);let offset=0;return block.glyphs.filter(glyph=>{const within=offset>=start&&offset<start+value.length;offset+=glyph.text.length;return within})};
 assert.ok(word('Both').every(glyph=>glyph.bold&&glyph.italic));
 assert.ok(word('inside').every(glyph=>glyph.bold&&glyph.italic));
 assert.ok(word('nested').every(glyph=>glyph.bold&&glyph.italic));
 assert.ok(word('*literal*').every(glyph=>!glyph.bold&&!glyph.italic));
 assert.ok(word('**code**').every(glyph=>glyph.style?.font==='Courier New'&&!Object.hasOwn(glyph.style,'size')));
 assert.equal(result.source,source);assert.deepEqual(result.warnings,[]);
});

test('J-card Markdown produces headings, tight and loose nested lists and quote structure',()=>{
 const result=parseJCardMarkdown('# One\n\nTwo\n---\n\n### Three\n#### Four\n##### Five\n###### Six\n\n5. Fifth\n   - Nested *item*\n   - Next\n6. Sixth\n\n- Loose first\n\n- Loose second\n\n> Quote\n>\n> > Inner');
 assert.deepEqual(result.blocks.slice(0,6).map(block=>[block.kind,block.level,block.value]),[['heading',1,'One'],['heading',2,'Two'],['heading',3,'Three'],['heading',4,'Four'],['heading',5,'Five'],['heading',6,'Six']]);
 const ordered=result.blocks[6];assert.equal(ordered.kind,'list');assert.equal(ordered.ordered,true);assert.equal(ordered.start,5);assert.equal(ordered.delimiter,'.');assert.equal(ordered.tight,true);
 assert.equal(ordered.children.length,2);assert.equal(ordered.children[0].kind,'item');assert.equal(ordered.children[0].children[1].kind,'list');assert.equal(ordered.children[0].children[1].ordered,false);
 assert.equal(result.blocks[7].tight,false);const quote=result.blocks[8];assert.equal(quote.kind,'quote');assert.equal(quote.children[1].kind,'quote');
 assert.equal(ordered.children[0].children[0].value,'Fifth');assert.equal(ordered.children[0].children[1].children[0].children[0].value,'Nested item');
 assert.ok(ordered.children[0].children[1].children[0].children[0].glyphs.some(glyph=>glyph.italic));
});

test('J-card Markdown distinguishes hard breaks, code blocks, thematic breaks and inert HTML',()=>{
 const result=parseJCardMarkdown('First\nSecond  \nThird\\\nFourth\n\n~~~js\n<script>x</script>\n~~~\n\n    indented <b> &amp;\n\n---\n\n<div onclick="bad()">literal</div>\n\nInline <b>safe</b>');
 assert.equal(result.blocks[0].value,'First\nSecond\nThird\nFourth');
 assert.deepEqual(result.blocks.map(block=>block.kind),['paragraph','code','code','thematic-break','html','paragraph']);
 assert.equal(result.blocks[1].info,'js');assert.equal(result.blocks[1].value,'<script>x</script>\n');assert.equal(result.blocks[2].value,'indented <b> &amp;\n');
 assert.ok(result.blocks[1].glyphs.every(glyph=>glyph.style.font==='Courier New'));
 assert.equal(result.blocks[4].value,'<div onclick="bad()">literal</div>');assert.equal(result.blocks[5].value,'Inline <b>safe</b>');
 assert.ok(result.blocks[5].glyphs.every(glyph=>!glyph.bold));
});

test('J-card Markdown keeps link and image metadata separate from visible grapheme text',()=>{
 const result=parseJCardMarkdown('[**Music** & notes](https://example.test/path "Listen") ![cover _alt_](https://example.test/image.png "Cover") 👩‍🎤 é');
 const block=result.blocks[0];assert.equal(block.value,'Music & notes cover alt 👩‍🎤 é');
 assert.deepEqual(block.links,[{destination:'https://example.test/path',title:'Listen',index:0,end:13,text:'Music & notes'}]);
 assert.deepEqual(block.images,[{destination:'https://example.test/image.png',title:'Cover',index:14,end:23,alt:'cover alt'}]);
 assert.ok(block.glyphs.some(glyph=>glyph.text==='👩‍🎤'));assert.ok(block.glyphs.some(glyph=>glyph.text==='é'));
 assert.deepEqual(parseJCardMarkdown('[unsafe](javascript:alert(1))').blocks[0].links.map(link=>link.destination),['javascript:alert(1)']);
 // No destinations are converted to HTML, executed or fetched by the parser.
 assert.ok(block.glyphs.every(glyph=>!glyph.text.includes('https://')));
});

test('J-card Markdown resolves reference links and CommonMark punctuation without changing music notation',()=>{
 const source='[A & B][album] <https://example.test/music> foo_bar_baz unmatched* 03:07 1_000_ \\_raw\\_ "quote" -- ...\r\nNext\rLine\n\n[album]: /albums/one "Album"';
 const result=parseJCardMarkdown(source),block=result.blocks[0];
 assert.equal(block.value,'A & B https://example.test/music foo_bar_baz unmatched* 03:07 1_000_ _raw_ "quote" -- ...\nNext\nLine');
 assert.deepEqual(block.links.map(({destination,title,text})=>({destination,title,text})),[{destination:'/albums/one',title:'Album',text:'A & B'},{destination:'https://example.test/music',title:'',text:'https://example.test/music'}]);
 assert.equal(result.blocks.length,1);assert.equal(source.includes('\r\n'),true);assert.equal(result.source.includes('\r'),false);
 assert.ok(block.glyphs.every(glyph=>!glyph.bold&&!glyph.italic));
});

test('J-card Markdown accepts a substantial cassette document without imposing ordinary text truncation',()=>{
 const track='**01.** Artist — title (03:07) 👩‍🎤';
 const result=parseJCardMarkdown(Array.from({length:1200},()=>track).join('\n'));
 assert.deepEqual(result.warnings,[]);assert.equal(result.truncated,false);assert.equal(result.blocks.length,1);
 assert.equal(result.blocks[0].glyphs.filter(glyph=>glyph.text==='\n').length,1199);
 assert.equal(result.blocks[0].glyphs.filter(glyph=>glyph.text==='👩‍🎤').length,1200);
 assert.equal(result.blocks[0].glyphs.filter(glyph=>glyph.bold).length,3600);
});

test('J-card Markdown does not alter input state and bounds long or deeply nested documents',()=>{
 const input=Object.freeze({toString:()=>'> '.repeat(700)+'**deep**'}),deep=parseJCardMarkdown(input,{maxDepth:24});
 assert.equal(deep.truncated,true);assert.ok(deep.warnings.includes('depth-limit'));assert.ok(allBlocks(deep).length<=24);
 const long=parseJCardMarkdown('x'.repeat(10000),{maxSourceLength:1000,maxGlyphs:80});assert.equal(long.source.length,1000);assert.equal(long.blocks[0].glyphs.length,80);assert.deepEqual(long.warnings,['source-limit','glyph-limit']);
 const many=parseJCardMarkdown(Array.from({length:100},(_,index)=>'- **item '+index+'**').join('\n'),{maxNodes:12});assert.equal(many.truncated,true);assert.ok(many.warnings.includes('node-limit'));assert.ok(allBlocks(many).length<12);
 assert.doesNotThrow(()=>JSON.stringify(deep));assert.doesNotThrow(()=>JSON.stringify(many));assert.equal(parseJCardMarkdown(null).plainText,'');
});
