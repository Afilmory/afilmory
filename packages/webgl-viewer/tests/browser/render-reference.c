#include <avif/avif.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static double half(uint16_t bits) {
  int exponent = (bits >> 10) & 31;
  double value = exponent ? ldexp(1.0 + (bits & 1023) / 1024.0, exponent - 15) : ldexp(bits & 1023, -24);
  return (bits & 32768) ? -value : value;
}
static void printPlane(const char *name, const avifImage *image) {
  avifRGBImage rgb;
  avifRGBImageSetDefaults(&rgb, image);
  rgb.format = AVIF_RGB_FORMAT_RGB;
  rgb.depth = 16;
  if (avifRGBImageAllocatePixels(&rgb) != AVIF_RESULT_OK || avifImageYUVToRGB(image, &rgb) != AVIF_RESULT_OK) exit(6);
  printf("\"%s\":{\"width\":%u,\"height\":%u,\"pixels\":[", name, rgb.width, rgb.height);
  for (uint32_t y = 0; y < rgb.height; y++) {
    const uint16_t *row = (const uint16_t *)(rgb.pixels + rgb.rowBytes * y);
    for (uint32_t x = 0; x < rgb.width; x++) {
      printf("%s[%.9g,%.9g,%.9g]", y || x ? "," : "", row[x*3]/65535.0, row[x*3+1]/65535.0, row[x*3+2]/65535.0);
    }
  }
  printf("]},");
  avifRGBImageFreePixels(&rgb);
}
int main(int argc, char **argv) {
  if (argc != 3 && argc != 4) return 2;
  avifDecoder *decoder = avifDecoderCreate();
  decoder->imageContentToDecode = AVIF_IMAGE_CONTENT_ALL;
  avifResult result = avifDecoderSetIOFile(decoder, argv[1]);
  if (result == AVIF_RESULT_OK) result = avifDecoderParse(decoder);
  if (result == AVIF_RESULT_OK) result = avifDecoderNextImage(decoder);
  if (result != AVIF_RESULT_OK || !decoder->image->gainMap) return 3;
  avifGainMap *map = decoder->image->gainMap;
  avifImage *base = decoder->image;
  avifImage *croppedBase = NULL, *croppedGain = NULL;
  avifGainMap croppedMap;
  if (argc == 4) {
    // Crop both planes before reconstructing: the lower-resolution gain map's
    // edge interpolation must clamp to the clean aperture, not outside it.
    const avifCropRect baseRect = {0, 0, 24, 16}, gainRect = {0, 0, 12, 8};
    croppedBase = avifImageCreateEmpty();
    croppedGain = avifImageCreateEmpty();
    if (avifImageSetViewRect(croppedBase, base, &baseRect) != AVIF_RESULT_OK ||
        avifImageSetViewRect(croppedGain, map->image, &gainRect) != AVIF_RESULT_OK) return 5;
    croppedMap = *map;
    croppedMap.image = croppedGain;
    map = &croppedMap;
    base = croppedBase;
  }
  float headroom = strcmp(argv[2], "hdr") == 0 ? (float)map->alternateHdrHeadroom.n / map->alternateHdrHeadroom.d : 0;
  avifRGBImage output;
  avifRGBImageSetDefaults(&output, base);
  output.format = AVIF_RGB_FORMAT_RGBA;
  output.depth = 16;
  output.isFloat = AVIF_TRUE;
  avifDiagnostics diag;
  result = avifImageApplyGainMap(base, map, headroom, AVIF_COLOR_PRIMARIES_BT2020,
                                AVIF_TRANSFER_CHARACTERISTICS_SMPTE2084, &output, NULL, &diag);
  if (result != AVIF_RESULT_OK) { fprintf(stderr, "%s: %s", avifResultToString(result), diag.error); return 4; }
  printf("{");
  printPlane("base", base);
  printPlane("gain", map->image);
  printf("\"width\":%u,\"height\":%u,\"pqRec2020\":[", output.width, output.height);
  for (uint32_t y = 0; y < output.height; y++) {
    const uint16_t *row = (const uint16_t *)(output.pixels + output.rowBytes * y);
    for (uint32_t x = 0; x < output.width; x++) {
      printf("%s[%.9g,%.9g,%.9g]", y || x ? "," : "", half(row[x*4]), half(row[x*4+1]), half(row[x*4+2]));
    }
  }
  puts("]}");
  avifRGBImageFreePixels(&output);
  if (croppedBase) avifImageDestroy(croppedBase);
  if (croppedGain) avifImageDestroy(croppedGain);
  avifDecoderDestroy(decoder);
  return 0;
}
