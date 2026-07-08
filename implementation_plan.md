# Integrate AI Image Footprint Remover

The goal is to automatically scrub AI-generated signatures and metadata from images when the user uploads them to the Pinterest Poster, ensuring they bypass AI detectors.

## Proposed Changes

I have reviewed the `AI IMAGE FOOTPRINT REMOVER` folder and its scripts (`test_and_remove.py` and `app.js`). Because your application is packaged for end-users as a standalone `.exe`, we cannot assume they have Python installed. Therefore, we must implement this processing entirely in JavaScript.

I propose integrating this directly into the **Node.js Publishing Engine** (`PublishExecutor.ts`) using a pure-JavaScript image processing library called `jimp`. This guarantees that **every image** (whether imported individually or via bulk spreadsheets) is automatically scrubbed right before it gets uploaded, without freezing the user interface.

### [Component: Backend Publisher]

#### [NEW] `electron/publisher/aiImageCleaner.ts`
We will create a new utility file that implements the 6-layer destruction protocol in JavaScript using `jimp`:
1. **Metadata Scrub**: Re-encoding the image through `jimp` automatically strips all hidden EXIF, XMP, and PNG text chunks.
2. **Invisible Edge Cropping**: Crops 2 pixels off the border to destroy spatial hashes.
3. **Resize Warp**: Micro-scales the image up and down to scramble Least Significant Bits.
4. **Latent Noise Destruction**: Applies a slight blur and contrast enhancement.
5. **Multi-Spectrum Jitter**: Randomly micro-adjusts brightness and color.
6. **Natural Compression**: Saves the final image as a JPEG with Quality 92 to force natural compression artifacts.

#### [MODIFY] `package.json`
- Add `"jimp": "^0.22.12"` to the dependencies.

#### [MODIFY] `electron/publisher/publishExecutor.ts`
- Right before `executeJob` uploads the image to Pinterest, it will intercept `job.imagePath`, pass it through `aiImageCleaner.ts`, and save a `_cleaned.jpg` temporary file.
- The `PublishExecutor` will then upload the 100% clean image to Pinterest.
- After publication, it will delete the temporary `_cleaned.jpg` file to save disk space.

## User Review Required

> [!IMPORTANT]
> To implement this, I will need to install the `jimp` library into the project. `jimp` is 100% pure JavaScript, meaning it will compile and package perfectly into the Windows `.exe` without any native C++ dependency issues. 
> 
> Does this background approach sound good to you? If you approve, I will proceed with the implementation!
