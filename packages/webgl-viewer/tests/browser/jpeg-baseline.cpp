// Public synthetic, paired JPEG/AVIF controls. No viewer parser or shader code.
// libjpeg encodes/decodes the JPEG planes; libultrahdr packages and reconstructs
// the JPEG gain map. Both formats receive identical pre-compression RGB samples.
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>
#include <string>
#include <avif/avif.h>
#include <jpeglib.h>
#include <ultrahdr_api.h>

static void check(avifResult r) {
  if (r != AVIF_RESULT_OK) { fprintf(stderr, "%s\n", avifResultToString(r)); exit(3); }
}
static void check(uhdr_error_info_t r) {
  if (r.error_code != UHDR_CODEC_OK) { fprintf(stderr, "%s\n", r.detail); exit(4); }
}
static void write(const std::string &path, const void *bytes, size_t size) {
  FILE *f = fopen(path.c_str(), "wb");
  if (!f || fwrite(bytes, 1, size, f) != size) exit(5);
  fclose(f);
}
struct RGB { unsigned w, h; std::vector<uint8_t> bytes; };
static RGB pattern(unsigned w, unsigned h, bool color, bool gain, bool constant) {
  RGB image{w, h, std::vector<uint8_t>(w * h * 3)};
  for (unsigned y = 0; y < h; ++y) for (unsigned x = 0; x < w; ++x) {
    double t = double(y) / (h - 1);
    for (unsigned c = 0; c < 3; ++c) {
      double value;
      if (gain && constant) value = 0.85;
      else if (!color) value = gain ? 0.03 + 0.94 * t : 0.15 + 0.65 * t;
      else {
        const double a[3] = {0.72, 0.25, 0.16}, b[3] = {0.15, 0.62, 0.82};
        const double ga[3] = {0.85, 0.25, 0.40}, gb[3] = {0.30, 0.70, 0.95};
        value = gain ? (x < w / 2 ? ga[c] : gb[c]) : (x < w / 2 ? a[c] : b[c]);
      }
      image.bytes[(y*w+x)*3+c] = uint8_t(std::round(value * 255));
    }
  }
  return image;
}
static std::vector<uint8_t> jpeg(const RGB &rgb, int subsampling) {
  jpeg_compress_struct c{};
  jpeg_error_mgr error;
  c.err = jpeg_std_error(&error);
  jpeg_create_compress(&c);
  unsigned char *data = nullptr;
  unsigned long size = 0;
  jpeg_mem_dest(&c, &data, &size);
  c.image_width = rgb.w; c.image_height = rgb.h;
  c.input_components = subsampling == 400 ? 1 : 3;
  c.in_color_space = subsampling == 400 ? JCS_GRAYSCALE : JCS_RGB;
  jpeg_set_defaults(&c);
  c.comp_info[0].h_samp_factor = c.comp_info[0].v_samp_factor = subsampling == 420 ? 2 : 1;
  jpeg_set_quality(&c, 95, TRUE);
  jpeg_start_compress(&c, TRUE);
  std::vector<uint8_t> gray(rgb.w);
  while (c.next_scanline < c.image_height) {
    JSAMPROW row = const_cast<uint8_t *>(rgb.bytes.data()) + c.next_scanline * rgb.w * 3;
    if (subsampling == 400) {
      for (unsigned x = 0; x < rgb.w; ++x) gray[x] = row[x*3];
      row = gray.data();
    }
    jpeg_write_scanlines(&c, &row, 1);
  }
  jpeg_finish_compress(&c);
  std::vector<uint8_t> result(data, data+size);
  free(data); jpeg_destroy_compress(&c);
  return result;
}
static RGB unjpeg(const uhdr_mem_block_t *input, bool fancy = true) {
  jpeg_decompress_struct d{};
  jpeg_error_mgr error;
  d.err = jpeg_std_error(&error);
  jpeg_create_decompress(&d);
  jpeg_mem_src(&d, static_cast<unsigned char *>(input->data), input->data_sz);
  jpeg_read_header(&d, TRUE);
  d.out_color_space = JCS_RGB;
  d.do_fancy_upsampling = fancy ? TRUE : FALSE;
  jpeg_start_decompress(&d);
  RGB rgb{d.output_width, d.output_height, std::vector<uint8_t>(d.output_width*d.output_height*3)};
  while (d.output_scanline < d.output_height) {
    JSAMPROW row = rgb.bytes.data() + d.output_scanline * rgb.w * 3;
    jpeg_read_scanlines(&d, &row, 1);
  }
  jpeg_finish_decompress(&d); jpeg_destroy_decompress(&d);
  return rgb;
}
static avifImage *avif(const RGB &input, int subsampling, bool gain) {
  avifImage *image = avifImageCreate(input.w, input.h, 8,
    subsampling == 400 ? AVIF_PIXEL_FORMAT_YUV400 : subsampling == 420 ? AVIF_PIXEL_FORMAT_YUV420 : AVIF_PIXEL_FORMAT_YUV444);
  image->colorPrimaries = gain ? 2 : 12;
  image->transferCharacteristics = gain ? 2 : 13;
  image->matrixCoefficients = 6;
  image->yuvRange = AVIF_RANGE_FULL;
  avifRGBImage rgb;
  avifRGBImageSetDefaults(&rgb, image);
  rgb.format = AVIF_RGB_FORMAT_RGB;
  rgb.depth = 8;
  rgb.pixels = const_cast<uint8_t *>(input.bytes.data());
  rgb.rowBytes = input.w * 3;
  check(avifImageRGBToYUV(image, &rgb));
  return image;
}
static void encode(const char *prefix, bool color, int baseSub, int gainSub, int ratio, bool constant) {
  RGB base = pattern(32, 24, color, false, false);
  RGB gain = pattern(32/ratio, 24/ratio, color && gainSub != 400, true, constant);
  auto b = jpeg(base, baseSub), g = jpeg(gain, gainSub);
  uhdr_compressed_image_t bj{b.data(), b.size(), b.size(), UHDR_CG_DISPLAY_P3, UHDR_CT_SRGB, UHDR_CR_FULL_RANGE};
  uhdr_compressed_image_t gj{g.data(), g.size(), g.size(), UHDR_CG_DISPLAY_P3, UHDR_CT_UNSPECIFIED, UHDR_CR_FULL_RANGE};
  uhdr_gainmap_metadata_t m{};
  for (int c = 0; c < 3; ++c) { m.min_content_boost[c] = 1; m.max_content_boost[c] = 8; m.gamma[c] = 1; }
  m.hdr_capacity_min = 1; m.hdr_capacity_max = 8; m.use_base_cg = 1;
  auto enc = uhdr_create_encoder();
  check(uhdr_enc_set_compressed_image(enc, &bj, UHDR_BASE_IMG));
  check(uhdr_enc_set_gainmap_image(enc, &gj, &m));
  check(uhdr_enc_set_output_format(enc, UHDR_CODEC_JPG));
  check(uhdr_encode(enc));
  auto output = uhdr_get_encoded_stream(enc);
  write(std::string(prefix)+".jpg", output->data, output->data_sz);
  uhdr_release_encoder(enc);

  avifImage *image = avif(base, baseSub, false);
  image->gainMap = avifGainMapCreate();
  auto map = image->gainMap;
  map->image = avif(gain, gainSub, true);
  for (int c = 0; c < 3; ++c) {
    map->gainMapMin[c] = {0, 1}; map->gainMapMax[c] = {3, 1};
    map->gainMapGamma[c] = {1, 1}; map->baseOffset[c] = {0, 1}; map->alternateOffset[c] = {0, 1};
  }
  map->baseHdrHeadroom = {0, 1}; map->alternateHdrHeadroom = {3, 1};
  map->useBaseColorSpace = AVIF_TRUE;
  map->altColorPrimaries = 12; map->altTransferCharacteristics = 16;
  map->altMatrixCoefficients = 6; map->altYUVRange = AVIF_RANGE_FULL;
  map->altDepth = 10; map->altPlaneCount = 3;
  auto encoder = avifEncoderCreate();
  encoder->quality = encoder->qualityGainMap = 95; encoder->speed = 8; encoder->maxThreads = 2;
  avifRWData file = AVIF_DATA_EMPTY;
  check(avifEncoderWrite(encoder, image, &file));
  write(std::string(prefix)+".avif", file.data, file.size);
  avifRWDataFree(&file); avifEncoderDestroy(encoder); avifImageDestroy(image);
}
static double half(uint16_t b) {
  int e = (b >> 10) & 31;
  return (b & 32768 ? -1 : 1) * (e ? ldexp(1+(b&1023)/1024.0, e-15) : ldexp(b&1023, -24));
}
static void plane(const char *name, const RGB &rgb) {
  printf("\"%s\":{\"width\":%u,\"height\":%u,\"pixels\":[", name, rgb.w, rgb.h);
  for (unsigned i = 0; i < rgb.w*rgb.h; ++i)
    printf("%s[%.9g,%.9g,%.9g]", i ? "," : "", rgb.bytes[i*3]/255.0, rgb.bytes[i*3+1]/255.0, rgb.bytes[i*3+2]/255.0);
  printf("]},");
}
static void reference(const char *path, bool hdr) {
  FILE *f = fopen(path, "rb"); if (!f) exit(5);
  fseek(f, 0, SEEK_END); long size = ftell(f); rewind(f);
  std::vector<uint8_t> bytes(size);
  if (fread(bytes.data(), 1, bytes.size(), f) != bytes.size()) exit(5);
  fclose(f);
  uhdr_compressed_image_t input{bytes.data(), bytes.size(), bytes.size(), UHDR_CG_UNSPECIFIED, UHDR_CT_UNSPECIFIED, UHDR_CR_UNSPECIFIED};
  auto dec = uhdr_create_decoder();
  check(uhdr_dec_set_image(dec, &input));
  check(uhdr_dec_set_out_img_format(dec, UHDR_IMG_FMT_64bppRGBAHalfFloat));
  check(uhdr_dec_set_out_color_transfer(dec, UHDR_CT_LINEAR));
  check(uhdr_dec_set_out_max_display_boost(dec, hdr ? 8 : 1));
  check(uhdr_dec_probe(dec));
  const auto *meta = uhdr_dec_get_gainmap_metadata(dec);
  // This controlled corpus uses base-space P3, zero offsets, unit gamma and 8x.
  if (!meta || !meta->use_base_cg || fabs(meta->hdr_capacity_max-8) > 1e-6) exit(6);
  for (int c = 0; c < 3; ++c)
    if (meta->min_content_boost[c] != 1 || meta->max_content_boost[c] != 8 ||
        meta->gamma[c] != 1 || meta->offset_sdr[c] != 0 || meta->offset_hdr[c] != 0) exit(6);
  RGB base = unjpeg(uhdr_dec_get_base_image(dec)), gain = unjpeg(uhdr_dec_get_gainmap_image(dec));
  RGB baseNearest = unjpeg(uhdr_dec_get_base_image(dec), false);
  check(uhdr_decode(dec));
  const auto *out = uhdr_get_decoded_image(dec);
  if (!out || out->cg != UHDR_CG_DISPLAY_P3 || out->ct != UHDR_CT_LINEAR) exit(7);
  printf("{"); plane("base", base); plane("gain", gain); plane("baseNearest", baseNearest);
  printf("\"width\":%u,\"height\":%u,\"linearP3\":[", out->w, out->h);
  for (unsigned y = 0; y < out->h; ++y) for (unsigned x = 0; x < out->w; ++x) {
    const uint16_t *p = static_cast<const uint16_t *>(out->planes[0]) + (y*out->stride[0]+x)*4;
    printf("%s[%.9g,%.9g,%.9g]", x || y ? "," : "", half(p[0]), half(p[1]), half(p[2]));
  }
  printf("]}\n"); uhdr_release_decoder(dec);
}
int main(int argc, char **argv) {
  if (argc == 8 && !strcmp(argv[1], "encode")) {
    encode(argv[2], !strcmp(argv[3], "color"), atoi(argv[4]), atoi(argv[5]), atoi(argv[6]), atoi(argv[7]));
  } else if (argc == 4 && !strcmp(argv[1], "reference")) {
    reference(argv[2], !strcmp(argv[3], "hdr"));
  } else { fprintf(stderr, "encode PREFIX PATTERN BASE_YUV GAIN_YUV RATIO CONSTANT | reference JPEG hdr/sdr\n"); return 2; }
}
