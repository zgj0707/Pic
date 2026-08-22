declare module 'jimp' {
  export class Jimp {
    width: number
    height: number
    static read(path: string | Buffer): Promise<Jimp>
    resize(options: { w: number; h: number }): Jimp
    quality(n: number): Jimp
    write(path: string): Promise<void>
    getBuffer(mimeType: string): Promise<Buffer>
  }
}
