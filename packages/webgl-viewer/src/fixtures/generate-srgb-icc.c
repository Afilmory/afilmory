// cc generate-srgb-icc.c -llcms2 -o /tmp/generate-srgb-icc
// /tmp/generate-srgb-icc srgb-matrix.icc
// LittleCMS generates matrix/TRC sRGB with ICC PCS D50 colorants.
#include <lcms2.h>
#include <stdio.h>

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    cmsHPROFILE profile = cmsCreate_sRGBProfile();
    if (!profile) return 1;
    cmsBool ok = cmsSaveProfileToFile(profile, argv[1]);
    cmsCloseProfile(profile);
    if (!ok) fprintf(stderr, "Could not save sRGB profile\n");
    return ok ? 0 : 1;
}
