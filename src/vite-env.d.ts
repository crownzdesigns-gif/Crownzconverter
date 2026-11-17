/// <reference types="vite/client" />

declare module "heic2any" {
  export default function heic2any(options: {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }): Promise<Blob | Blob[]>;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}

declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(imageData: ImageData, options?: Record<string, unknown>): string;
  };
  export default ImageTracer;
}

declare module "pdf-lib-plus-encrypt" {
  export * from "pdf-lib";
  import type { PDFDocument as Base } from "pdf-lib";
  export const PDFDocument: typeof import("pdf-lib").PDFDocument & {
    prototype: Base & {
      encrypt(options: {
        userPassword: string;
        ownerPassword?: string;
        permissions?: Record<string, boolean>;
      }): Promise<void>;
    };
  };
}
