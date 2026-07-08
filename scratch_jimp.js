const Jimp = require('jimp');

async function test() {
    const image = await Jimp.read('C:\\Users\\jibra\\Desktop\\1\\AI IMAGE FOOTPRINT REMOVER\\testing\\4 borad image\\3.jpg');
    console.log(`Original: ${image.getWidth()}x${image.getHeight()}`);
    
    const originalWidth = image.getWidth();
    const originalHeight = image.getHeight();
    
    // Test crop
    image.crop(2, 2, originalWidth - 4, originalHeight - 4);
    console.log(`Cropped: ${image.getWidth()}x${image.getHeight()}`);
    
    // Test resize
    image.resize(originalWidth + 3, originalHeight + 3);
    console.log(`Resized up: ${image.getWidth()}x${image.getHeight()}`);
    
    // Test blur
    image.blur(1);
    
    // Test color
    image.brightness(0.02);
    image.contrast(0.03);
    
    await image.quality(92).writeAsync('C:\\temp\\jimp_test.jpg');
    console.log('Saved');
}

test().catch(console.error);
