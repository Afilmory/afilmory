// Re-encode public synthetic fixtures through RGB, changing actual AV1 samples
// as well as nclx. Merely flipping the range flag would not test limited range.
#include <avif/avif.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void check(avifResult result) {
  if (result != AVIF_RESULT_OK) {
    fprintf(stderr, "%s\n", avifResultToString(result));
    exit(3);
  }
}

static avifImage *convert(const avifImage *source, int depth, avifPixelFormat format, avifRange range) {
  avifRGBImage rgb;
  avifRGBImageSetDefaults(&rgb, source);
  rgb.depth = 16;
  rgb.format = AVIF_RGB_FORMAT_RGB;
  check(avifRGBImageAllocatePixels(&rgb));
  check(avifImageYUVToRGB(source, &rgb));
  avifImage *image = avifImageCreate(source->width, source->height, depth, format);
  image->colorPrimaries = source->colorPrimaries;
  image->transferCharacteristics = source->transferCharacteristics;
  image->matrixCoefficients = source->matrixCoefficients;
  image->yuvRange = range;
  check(avifImageRGBToYUV(image, &rgb));
  avifRGBImageFreePixels(&rgb);
  return image;
}

int main(int argc, char **argv) {
  if (argc != 10 && (argc != 11 || strcmp(argv[10], "positive-base-headroom"))) return 2;
  avifDecoder *decoder = avifDecoderCreate();
  decoder->imageContentToDecode = AVIF_IMAGE_CONTENT_ALL;
  check(avifDecoderSetIOFile(decoder, argv[1]));
  check(avifDecoderParse(decoder));
  check(avifDecoderNextImage(decoder));
  if (!decoder->image->gainMap) return 4;
  const int depth = atoi(argv[3]), ratio = atoi(argv[6]), width = atoi(argv[7]);
  const avifPixelFormat format = atoi(argv[4]) == 420 ? AVIF_PIXEL_FORMAT_YUV420 : AVIF_PIXEL_FORMAT_YUV444;
  avifImage *image = convert(decoder->image, depth, format, atoi(argv[5]) ? AVIF_RANGE_FULL : AVIF_RANGE_LIMITED);
  image->gainMap = decoder->image->gainMap;
  decoder->image->gainMap = NULL;
  // SDR encoders can measure small positive base headroom after conversion.
  // Exercise that metadata without including a private photograph fixture.
  if (argc == 11) {
    image->gainMap->baseHdrHeadroom.n = 1;
    image->gainMap->baseHdrHeadroom.d = 512;
  }
  avifImage *gain = convert(image->gainMap->image, atoi(argv[8]),
                           atoi(argv[9]) == 420 ? AVIF_PIXEL_FORMAT_YUV420 : AVIF_PIXEL_FORMAT_YUV444, AVIF_RANGE_FULL);
  avifImageDestroy(image->gainMap->image);
  image->gainMap->image = gain;
  avifDiagnostics diag;
  check(avifImageScale(image, width, width * 3 / 4, &diag));
  check(avifImageScale(gain, width / ratio, width * 3 / 4 / ratio, &diag));
  avifEncoder *encoder = avifEncoderCreate();
  encoder->maxThreads = 2;
  encoder->speed = 8;
  encoder->quality = 95;
  encoder->qualityGainMap = 95;
  avifRWData output = AVIF_DATA_EMPTY;
  check(avifEncoderWrite(encoder, image, &output));
  FILE *file = fopen(argv[2], "wb");
  if (!file || fwrite(output.data, 1, output.size, file) != output.size) return 5;
  fclose(file);
  avifRWDataFree(&output);
  avifEncoderDestroy(encoder);
  avifImageDestroy(image);
  avifDecoderDestroy(decoder);
  return 0;
}
