# Icons for PWA

This folder contains icons for the Progressive Web App.

## Current Icons
- `icon.svg` - SVG source icon (used as fallback)

## Required PNG Icons (To be generated)
For optimal PWA support, generate PNG icons at these sizes:
- `icon-192.png` - 192x192 pixels (required for PWA)
- `icon-512.png` - 512x512 pixels (required for PWA)

## How to Generate PNG Icons

### Option 1: Use SVG as source
1. Take `icon.svg` as source
2. Use an online converter like:
   - https://svg2png.com/
   - https://cloudconvert.com/svg-to-png
3. Generate at 192x192 and 512x512

### Option 2: Create custom icons
- Use any image editor (Photoshop, GIMP, Figma, Canva)
- Create icons at the required sizes
- Save as PNG with transparent background

### Option 3: Use a PWA icon generator
- https://realfavicongenerator.net/
- https://www.favicon-generator.org/
- Upload your SVG or image and generate all required sizes

## Icon Design Guidelines
- Use the color scheme: Primary #5c7cfa, Background #101827
- Keep it simple and recognizable at small sizes
- Use transparent background for PNG files
- Icon should represent SMS/messages (envelope, chat bubble, etc.)

## Files to generate
```
assets/icons/
├── icon.svg          # Source SVG
├── icon-192.png      # 192x192 for Android
├── icon-512.png      # 512x512 for higher resolution
└── README.md         # This file
```

Once generated, commit the PNG files and they will be automatically used by the PWA manifest.
