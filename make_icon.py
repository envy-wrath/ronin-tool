"""Génère assets/ronin.ico : enso clair + kanji rouge sur fond noir."""
import math, random
from PIL import Image, ImageDraw, ImageFilter
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.ellipse((24, 24, S - 24, S - 24), fill=(8, 6, 7, 255))
random.seed(3)
# enso : cercle de pinceau qui s'affine
for k in range(900):
    a = math.radians(-60 + k * 330 / 900)
    t = k / 900
    w = 30 * (1 - t) ** 0.6 + 4
    r = 190 + random.uniform(-3, 3)
    x, y = S / 2 + r * math.cos(a), S / 2 + r * math.sin(a)
    d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=(235, 228, 222, 255))
# 刃 stylisé en traits rouges
red = (227, 16, 30, 255)
d.line([(170, 175), (335, 175), (325, 345), (290, 330)], fill=red, width=34, joint="curve")
d.line([(245, 150), (230, 260), (160, 360)], fill=red, width=34, joint="curve")
d.line([(195, 245), (215, 285)], fill=red, width=28)
img = img.filter(ImageFilter.SMOOTH)
img.save("assets/ronin.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.save("assets/ronin.png")
print("ok")
