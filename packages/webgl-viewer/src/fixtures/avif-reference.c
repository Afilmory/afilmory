#include <avif/avif.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char **argv) {
  if(argc!=2 && argc!=3)return 2;
  avifDecoder *d=avifDecoderCreate();
  d->imageContentToDecode=AVIF_IMAGE_CONTENT_ALL;
  avifResult r=avifDecoderSetIOFile(d,argv[1]);
  if(r==AVIF_RESULT_OK)r=avifDecoderParse(d);
  if(r==AVIF_RESULT_OK)r=avifDecoderNextImage(d);
  if(r!=AVIF_RESULT_OK){fprintf(stderr,"%s",avifResultToString(r));return 1;}
  avifGainMap *g=d->image->gainMap;
  if(!g){puts("null");avifDecoderDestroy(d);return 0;}
  if(argc==3 && strcmp(argv[2], "--gain-samples")==0){
    avifRGBImage rgb;
    avifRGBImageSetDefaults(&rgb,g->image);
    rgb.depth=8;rgb.format=AVIF_RGB_FORMAT_RGB;
    if(avifRGBImageAllocatePixels(&rgb)!=AVIF_RESULT_OK || avifImageYUVToRGB(g->image,&rgb)!=AVIF_RESULT_OK)return 1;
    printf("{\"width\":%u,\"height\":%u,\"pixels\":[",rgb.width,rgb.height);
    for(int i=0;i<9;i++){
      unsigned x=(rgb.width-1)*(i%3)/2,y=(rgb.height-1)*(i/3)/2;
      unsigned char *p=rgb.pixels+y*rgb.rowBytes+x*3;
      printf("%s{\"x\":%u,\"y\":%u,\"rgb\":[%u,%u,%u]}",i?",":"",x,y,p[0],p[1],p[2]);
    }
    puts("]}");avifRGBImageFreePixels(&rgb);avifDecoderDestroy(d);return 0;
  }
  printf("{\"capacityMin\":%.17g,\"capacityMax\":%.17g,\"useBaseColorSpace\":%s",(double)g->baseHdrHeadroom.n/g->baseHdrHeadroom.d,(double)g->alternateHdrHeadroom.n/g->alternateHdrHeadroom.d,g->useBaseColorSpace?"true":"false");
  const char *names[]={"min","max","offsetBase","offsetAlternate"};
  avifSignedFraction *values[]={g->gainMapMin,g->gainMapMax,g->baseOffset,g->alternateOffset};
  for(int f=0;f<4;f++){printf(",\"%s\":[",names[f]);for(int c=0;c<3;c++)printf("%s%.17g",c?",":"",(double)values[f][c].n/values[f][c].d);printf("]");}
  printf(",\"gamma\":[");for(int c=0;c<3;c++)printf("%s%.17g",c?",":"",(double)g->gainMapGamma[c].n/g->gainMapGamma[c].d);puts("]}");
  avifDecoderDestroy(d);
}
