import {describe,it,expect} from 'vitest';
import {stripPhotoMetadata,photoKind} from '../base44/shared/photoMetadata.ts';

// Uploaded photos lose the GPS position and other details the phone wrote
// into them; the picture itself, its colour profile and which way up it goes
// are kept. Fixtures: tiny pictures made with ImageMagick (-strip), with
// made-up metadata added here. No real location anywhere.

const b64=s=>new Uint8Array(Buffer.from(s,'base64'));
const JPEG=b64('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIABADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAABAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAACQcI/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AhTZqCDjlK8//2Q==');
const PNG=b64('iVBORw0KGgoAAAANSUhEUgAAABAAAAAIAQMAAADKuO3UAAAABlBMVEUUWtzIHh6S8+1NAAAADklEQVQI12Ng+M+ADQEAW7wH+aHHReoAAAAASUVORK5CYII=');
const WEBP=b64('UklGRjwAAABXRUJQVlA4IDAAAACQAQCdASoQAAgAAgA0JaACdLoAA5gA/vBA2i/9g7wt/5wFeP/lK//Us/G79ygAAAA=');

const bytes=s=>[...Buffer.from(s,'latin1')];
const be16=n=>[(n>>8)&255,n&255];
const be32=n=>[(n>>>24)&255,(n>>16)&255,(n>>8)&255,n&255];
const le16=n=>[n&255,(n>>8)&255];
const le32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>>24)&255];
const seg=(marker,body)=>[0xff,marker,...be16(body.length+2),...body];
const text=b=>Buffer.from(b).toString('latin1');

// An EXIF block like a phone's: the maker, which way up, and a GPS position.
function exif(orientation,{little=false}={}) {
 const w16=little?le16:be16,w32=little?le32:be32;
 const make=bytes('TestPhone GPS-SECRET 12.05N\0');
 // TIFF offsets: IFD0 at 8 (3 entries, ends 50), GPS IFD at 50 (ends 68), the maker's name at 68.
 const ifd0=[...w16(3),
  ...w16(0x010f),...w16(2),...w32(make.length),...w32(68),
  ...w16(0x0112),...w16(3),...w32(1),...(little?[orientation,0,0,0]:[0,orientation,0,0]),
  ...w16(0x8825),...w16(4),...w32(1),...w32(50),
  ...w32(0)];
 const gps=[...w16(1),...w16(0x0001),...w16(2),...w32(2),0x4e,0,0,0,...w32(0)];
 return seg(0xe1,[...bytes('Exif\0\0'),...(little?[0x49,0x49,0x2a,0]:[0x4d,0x4d,0,0x2a]),...w32(8),...ifd0,...gps,...make]);
}
const ONLY_ORIENTATION=o=>[0xff,0xe1,0,34,...bytes('Exif\0\0MM\0*'),0,0,0,8,0,1,1,0x12,0,3,0,0,0,1,0,o,0,0,0,0,0,0];
const APP0_END=4+((JPEG[4]<<8)|JPEG[5]); // the JFIF header after the start marker
const withSegments=(...segments)=>new Uint8Array([...JPEG.subarray(0,APP0_END),...segments.flat(),...JPEG.subarray(APP0_END)]);

describe('JPEG',()=>{
 it('a clean photo comes back byte for byte',()=>{
  expect(photoKind(JPEG)).toBe('jpeg');
  expect(stripPhotoMetadata(JPEG)).toEqual(JPEG);
 });
 it('loses the GPS position, the maker, XMP, IPTC, comments and pictures tacked on after the end',()=>{
  const phone=new Uint8Array([
   ...withSegments(exif(6),seg(0xe1,bytes('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS-SECRET</x:xmpmeta>')),seg(0xed,bytes('Photoshop 3.0\0GPS-SECRET')),seg(0xfe,bytes('GPS-SECRET comment'))),
   ...withSegments(exif(1)), // a second picture after the first one's end, with its own EXIF
  ]);
  const out=stripPhotoMetadata(phone);
  expect(text(out)).not.toMatch(/GPS-SECRET|TestPhone|xmpmeta|Photoshop/);
  // The same picture, with only "which way up" kept, right after the JFIF header.
  expect(out).toEqual(new Uint8Array([...JPEG.subarray(0,APP0_END),...ONLY_ORIENTATION(6),...JPEG.subarray(APP0_END)]));
 });
 it('keeps which way up from little-endian EXIF too, and adds nothing when it is already upright',()=>{
  expect(stripPhotoMetadata(withSegments(exif(3,{little:true})))).toEqual(new Uint8Array([...JPEG.subarray(0,APP0_END),...ONLY_ORIENTATION(3),...JPEG.subarray(APP0_END)]));
  expect(stripPhotoMetadata(withSegments(exif(1)))).toEqual(JPEG);
 });
 it('keeps the colour profile but not the multi-picture index',()=>{
  const icc=seg(0xe2,bytes('ICC_PROFILE\0\x01\x01fake-profile'));
  const out=stripPhotoMetadata(withSegments(icc,seg(0xe2,bytes('MPF\0GPS-SECRET'))));
  expect(out).toEqual(withSegments(icc));
 });
 it('a photo it cannot read is left to upload as it came',()=>{
  expect(stripPhotoMetadata(JPEG.subarray(0,JPEG.length-2))).toBeNull(); // no end marker
  expect(stripPhotoMetadata(new Uint8Array([0xff,0xd8,0xff]))).toBeNull();
  expect(stripPhotoMetadata(new Uint8Array(bytes('%PDF-1.7 GPS')))).toBeNull();
 });
});

describe('PNG',()=>{
 const chunk=(type,data)=>[...be32(data.length),...bytes(type),...data,0,0,0,0];
 it('loses text and EXIF chunks, keeps the picture',()=>{
  const ihdrEnd=8+12+13; // signature, then the 13-byte IHDR chunk
  const phone=new Uint8Array([...PNG.subarray(0,ihdrEnd),...chunk('tEXt',bytes('Comment\0GPS-SECRET')),...chunk('eXIf',exif(6).slice(4)),...chunk('iTXt',bytes('XML:com.adobe.xmp\0\0\0\0\0GPS-SECRET')),...PNG.subarray(ihdrEnd)]);
  const out=stripPhotoMetadata(phone);
  expect(text(out)).not.toContain('GPS-SECRET');
  expect(out).toEqual(PNG);
 });
});

describe('WebP',()=>{
 const chunk=(type,data)=>[...bytes(type),...le32(data.length),...data,...(data.length&1?[0]:[])];
 it('loses the EXIF and XMP chunks and their flags',()=>{
  const image=[...WEBP.subarray(12)];
  const vp8x=chunk('VP8X',[0x08|0x04,0,0,0,15,0,0,7,0,0]); // EXIF and XMP flags, 16x8
  const body=[...bytes('WEBP'),...vp8x,...image,...chunk('EXIF',exif(6).slice(4)),...chunk('XMP ',bytes('<x:xmpmeta>GPS-SECRET</x:xmpmeta>'))];
  const phone=new Uint8Array([...bytes('RIFF'),...le32(body.length),...body]);
  const out=stripPhotoMetadata(phone);
  expect(text(out)).not.toMatch(/GPS-SECRET|TestPhone|EXIF|XMP /);
  const expectedBody=[...bytes('WEBP'),...chunk('VP8X',[0,0,0,0,15,0,0,7,0,0]),...image];
  expect(out).toEqual(new Uint8Array([...bytes('RIFF'),...le32(expectedBody.length),...expectedBody]));
 });
 it('a plain WebP comes back byte for byte',()=>{
  expect(stripPhotoMetadata(WEBP)).toEqual(WEBP);
 });
});
