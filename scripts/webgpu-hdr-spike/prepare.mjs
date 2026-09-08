// Usage: node scripts/webgpu-hdr-spike/prepare.mjs /path/to/ultrahdr_app
// Reference library must be built with -DUHDR_MAX_DIMENSION=32768.
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('./fixtures/',import.meta.url));
const input=fileURLToPath(new URL('../../photos/IMG_20251111_002156.jpg',import.meta.url));
const app=process.argv[2];if(!app)throw Error('Pass reference ultrahdr_app executable path');
mkdirSync(dir,{recursive:true});
const probe=execFileSync(app,['-m','1','-j',input,'-P'],{encoding:'utf8'});
if(!probe.includes('Ultra HDR Image: Yes'))throw Error('Input is not Ultra HDR');
writeFileSync(dir+'metadata.cfg',probe.split('\n').filter(line=>line.startsWith('--')).join('\n')+'\n');
writeFileSync(dir+'gain-original.jpg',execFileSync('exiftool',['-b','-GainMapImage',input],{maxBuffer:8*1024*1024}));
await sharp(input).resize(12288,16384).withIccProfile('p3').jpeg({quality:95}).toFile(dir+'base.jpg');
await sharp(dir+'gain-original.jpg').resize(3072,4096).jpeg({quality:95}).toFile(dir+'gain.jpg');
await sharp(dir+'base.jpg').resize(768,1024).withIccProfile('p3').jpeg({quality:95}).toFile(dir+'overview.jpg');
await sharp(dir+'gain.jpg').resize(192,256).jpeg({quality:95}).toFile(dir+'overview-gain.jpg');
execFileSync(app,['-m','0','-i',dir+'base.jpg','-g',dir+'gain.jpg','-f',dir+'metadata.cfg','-z',dir+'hdr-201mp.jpg'],{stdio:'inherit'});
console.log(execFileSync(app,['-m','1','-j',dir+'hdr-201mp.jpg','-P'],{encoding:'utf8'}));
const {width,height}=await sharp(dir+'hdr-201mp.jpg').metadata();
if(width*height!==201326592)throw Error('Wrong sample dimensions');
console.log({width,height,pixels:width*height,source:'Resampled real HDR, not native 200MP capture'});
