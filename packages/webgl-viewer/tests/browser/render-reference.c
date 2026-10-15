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
static void printPlaneVariant(const char *name, const avifImage *image, int depth, avifChromaUpsampling chroma, avifRGBFormat format) {
  avifRGBImage rgb;
  avifRGBImageSetDefaults(&rgb, image);
  rgb.format = format;
  if (depth) rgb.depth = depth;
  rgb.chromaUpsampling = chroma;
  if (avifRGBImageAllocatePixels(&rgb) != AVIF_RESULT_OK || avifImageYUVToRGB(image, &rgb) != AVIF_RESULT_OK) exit(6);
  printf("\"%s\":{\"width\":%u,\"height\":%u,\"pixels\":[", name, rgb.width, rgb.height);
  for (uint32_t y = 0; y < rgb.height; y++) {
    const uint8_t *row = rgb.pixels + rgb.rowBytes * y;
    for (uint32_t x = 0; x < rgb.width; x++) {
      const int channels = format == AVIF_RGB_FORMAT_RGB ? 3 : 4;
      const double maximum = (1 << rgb.depth) - 1;
      double pixel[3];
      for (int c = 0; c < 3; c++) pixel[c] = (rgb.depth > 8 ? ((const uint16_t *)row)[x*channels+c] : row[x*channels+c]) / maximum;
      printf("%s[%.9g,%.9g,%.9g]", y || x ? "," : "", pixel[0], pixel[1], pixel[2]);
    }
  }
  printf("]},");
  avifRGBImageFreePixels(&rgb);
}
static void printPlane(const char *name, const avifImage *image) {
  printPlaneVariant(name, image, 16, AVIF_CHROMA_UPSAMPLING_AUTOMATIC, AVIF_RGB_FORMAT_RGB);
}
static void printPrimaries(const char *name, avifColorPrimaries primaries) {
  float xy[8];
  avifColorPrimariesGetValues(primaries, xy);
  printf("\"%s\":[", name);
  for (int i = 0; i < 8; i++) printf("%s%.9g", i ? "," : "", xy[i]);
  printf("],");
}
static void printYUV(const avifImage *image) {
  printf("\"baseYUV\":{\"depth\":%u,\"planes\":[", image->depth);
  for (int c = 0; c < 3; c++) {
    const uint32_t width = avifImagePlaneWidth(image, c), height = avifImagePlaneHeight(image, c);
    printf("%s{\"width\":%u,\"height\":%u,\"values\":[", c ? "," : "", width, height);
    for (uint32_t y = 0; y < height; y++) {
      const uint8_t *row = avifImagePlane(image, c) + y * avifImagePlaneRowBytes(image, c);
      for (uint32_t x = 0; x < width; x++) printf("%s%u", x || y ? "," : "", image->depth > 8 ? ((const uint16_t *)row)[x] : row[x]);
    }
    printf("]}");
  }
  printf("]},");
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
  if (getenv("AVIF_DIAGNOSTICS")) {
    if (base->transferCharacteristics != AVIF_TRANSFER_CHARACTERISTICS_SRGB) return 8;
    printPrimaries("basePrimaries", base->colorPrimaries);
    printYUV(base);
    printPrimaries("workingPrimaries", map->useBaseColorSpace ? base->colorPrimaries : map->altColorPrimaries);
    printPrimaries("displayPrimaries", AVIF_COLOR_PRIMARIES_SMPTE432);
    printPlaneVariant("baseNearest", base, 16, AVIF_CHROMA_UPSAMPLING_NEAREST, AVIF_RGB_FORMAT_RGB);
    printPlaneVariant("baseRGB8", base, 8, AVIF_CHROMA_UPSAMPLING_AUTOMATIC, AVIF_RGB_FORMAT_RGBA);
    printPlaneVariant("nativeBase", base, 0, AVIF_CHROMA_UPSAMPLING_AUTOMATIC, AVIF_RGB_FORMAT_RGBA);
    avifImage *scaled = avifImageCreateEmpty();
    const avifCropRect rect = {0, 0, map->image->width, map->image->height};
    if (avifImageSetViewRect(scaled, map->image, &rect) != AVIF_RESULT_OK ||
        avifImageScale(scaled, base->width, base->height, &diag) != AVIF_RESULT_OK) return 9;
    printPlane("scaledGainRGB16", scaled);
    printPlaneVariant("nativeScaledGain", scaled, 0, AVIF_CHROMA_UPSAMPLING_AUTOMATIC, AVIF_RGB_FORMAT_RGBA);
    avifImageDestroy(scaled);
  }
  printf("\"metadata\":{\"useBaseColorSpace\":%s,\"capacityMin\":%.12g,\"capacityMax\":%.12g",
         map->useBaseColorSpace ? "true" : "false",
         (double)map->baseHdrHeadroom.n / map->baseHdrHeadroom.d,
         (double)map->alternateHdrHeadroom.n / map->alternateHdrHeadroom.d);
  const char *fields[] = {"min", "max", "gamma", "offsetBase", "offsetAlternate"};
  for (int field = 0; field < 5; field++) {
    printf(",\"%s\":[", fields[field]);
    for (int c = 0; c < 3; c++) {
      double value = field == 0 ? (double)map->gainMapMin[c].n / map->gainMapMin[c].d
        : field == 1 ? (double)map->gainMapMax[c].n / map->gainMapMax[c].d
        : field == 2 ? (double)map->gainMapGamma[c].n / map->gainMapGamma[c].d
        : field == 3 ? (double)map->baseOffset[c].n / map->baseOffset[c].d
        : (double)map->alternateOffset[c].n / map->alternateOffset[c].d;
      printf("%s%.12g", c ? "," : "", value);
    }
    printf("]");
  }
  printf("},");
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
