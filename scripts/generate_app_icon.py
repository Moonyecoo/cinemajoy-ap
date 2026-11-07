#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw, ImageFilter

def make_icon():
    size = 1024
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    # 1. Base Squircle geometry (macOS standard 824x824 centered)
    sq_size = 824
    offset = (size - sq_size) // 2
    radius = 185
    
    # Create shadow
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle(
        [offset, offset + 20, offset + sq_size, offset + sq_size + 20],
        radius=radius,
        fill=(0, 0, 0, 110)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    img.alpha_composite(shadow)
    
    # Create squircle body with rich cinema sapphire-to-azure gradient
    body = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(body)
    
    # Gradient interpolation
    c_top = (18, 90, 240)       # #125af0 Vibrant Cinema Blue
    c_bot = (0, 198, 255)       # #00c6ff Azure Cyan
    
    mask = Image.new('L', (size, size), 0)
    m_draw = ImageDraw.Draw(mask)
    m_draw.rounded_rectangle(
        [offset, offset, offset + sq_size, offset + sq_size],
        radius=radius,
        fill=255
    )
    
    # Draw vertical linear gradient
    grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(grad)
    for y in range(offset, offset + sq_size):
        ratio = (y - offset) / sq_size
        r = int(c_top[0] * (1 - ratio) + c_bot[0] * ratio)
        g = int(c_top[1] * (1 - ratio) + c_bot[1] * ratio)
        b = int(c_top[2] * (1 - ratio) + c_bot[2] * ratio)
        g_draw.line([(offset, y), (offset + sq_size, y)], fill=(r, g, b, 255))
        
    body.paste(grad, (0, 0), mask)
    
    # Add subtle top rim specular highlight
    highlight = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    h_draw = ImageDraw.Draw(highlight)
    h_draw.rounded_rectangle(
        [offset + 1, offset + 1, offset + sq_size - 1, offset + sq_size - 1],
        radius=radius - 1,
        outline=(255, 255, 255, 70),
        width=3
    )
    highlight_mask = Image.new('L', (size, size), 0)
    hm_draw = ImageDraw.Draw(highlight_mask)
    # only keep top half
    hm_draw.rectangle([0, 0, size, size // 2], fill=255)
    body.paste(highlight, (0, 0), highlight_mask)
    
    img.alpha_composite(body)
    
    # 2. Cinema Play Glyph (Clean, Pure, Elegant)
    # Center is at (512, 512)
    # Play triangle slightly shifted to optical center (+18px right)
    tri_w = 260
    tri_h = 300
    cx = 512 + 24
    cy = 512
    
    p1 = (cx - tri_w // 2, cy - tri_h // 2)
    p2 = (cx + tri_w // 2, cy)
    p3 = (cx - tri_w // 2, cy + tri_h // 2)
    
    # Glyph shadow
    g_shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gs_draw = ImageDraw.Draw(g_shadow)
    gs_draw.polygon([p1, p2, p3], fill=(0, 0, 0, 80))
    g_shadow = g_shadow.filter(ImageFilter.GaussianBlur(16))
    img.alpha_composite(g_shadow)
    
    # Crisp pure white glyph with subtle warm glow
    glyph = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gl_draw = ImageDraw.Draw(glyph)
    gl_draw.polygon([p1, p2, p3], fill=(255, 255, 255, 255))
    img.alpha_composite(glyph)
    
    os.makedirs('assets', exist_ok=True)
    img.save('assets/icon-1024.png', 'PNG')
    print('Generated assets/icon-1024.png')
    
    # Generate macOS AppIcon.iconset
    iconset_dir = 'assets/AppIcon.iconset'
    os.makedirs(iconset_dir, exist_ok=True)
    
    sizes = [
        (16, 'icon_16x16.png'),
        (32, 'icon_16x16@2x.png'),
        (32, 'icon_32x32.png'),
        (64, 'icon_32x32@2x.png'),
        (128, 'icon_128x128.png'),
        (256, 'icon_128x128@2x.png'),
        (256, 'icon_256x256.png'),
        (512, 'icon_256x256@2x.png'),
        (512, 'icon_512x512.png'),
        (1024, 'icon_512x512@2x.png'),
    ]
    
    resample = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(getattr(Image, 'Resampling', Image), 'LANCZOS') else Image.ANTIALIAS
    for s, name in sizes:
        resized = img.resize((s, s), resample)
        resized.save(os.path.join(iconset_dir, name), 'PNG')
        
    print(f'Generated {len(sizes)} icons in {iconset_dir}')

if __name__ == '__main__':
    make_icon()
