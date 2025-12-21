declare module 'canvas2svg' {
    export default class C2S {
        constructor(width: number, height: number);
        getSerializedSvg(fixNamedEntities?: boolean): string;
        // Add other methods as needed, but for now we treat it as any compatible context
        [key: string]: any;
    }
}
