from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
im = Image.new('RGBA', (512, 512))
d = ImageDraw.Draw(im)
d.rounded_rectangle((8, 8, 504, 504), radius=104, fill='#131139')
d.rounded_rectangle((54, 116, 458, 397), radius=29, fill='#ece8d9')
d.rounded_rectangle((85, 147, 427, 298), radius=16, fill='#c4d88b')
d.rounded_rectangle((116, 187, 396, 256), radius=31, fill='#131139')
for x in (164, 348):
    d.ellipse((x-36, 185, x+36, 257), fill='#ece8d9')
    d.ellipse((x-18, 203, x+18, 239), fill='#131139')
d.polygon([(171, 318), (341, 318), (373, 373), (139, 373)], fill='#131139')
for x in (116, 396):
    d.ellipse((x-7, 352, x+7, 366), fill='#131139')
im.save(root / 'icon.png')
im.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
