import {JavaClassSource} from "./javaFileClassLoader.js";

export class JavaJarClassSource extends JavaClassSource {
    constructor(jarFile) {
        super();
        this.jarFile = jarFile;
    }

    /**
     * @type {JSZip}
     */
    jarFile;

    async findClassFile(name) {
        let file = this.jarFile.file(name);
        if (file != null) {
            return await file.async("arraybuffer");
        }
        return null;
    }

}
