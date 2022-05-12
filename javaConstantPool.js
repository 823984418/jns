import {JavaAccessFlags, JavaType} from "./javaContext.js";

export class JavaConstant {
    static TAG = -1;

    constructor() {
        this.tag = this.constructor.TAG;
    }

    /**
     * @type {number}
     */
    tag;

    /**
     * @type {JavaConstantPool}
     */
    pool;

    /**
     * @param {DataView} dataView
     * @param {number} offset
     * @return {number}
     */
    read(dataView, offset) {
        throw new Error();
    }
}

export class JavaConstantUtf8 extends JavaConstant {
    static TAG = 1;

    /**
     * @type {string}
     */
    utf8;

    /**
     * @param {DataView} dataView
     * @param {number} offset
     */
    read(dataView, offset) {
        let length = dataView.getUint16(offset);
        offset += 2;
        this.utf8 = new TextDecoder("UTF-8").decode(new DataView(dataView.buffer, dataView.byteOffset + offset, length));
        offset += length;
        return offset;
    }

    /**
     * @return {JavaConstantUtf8}
     */
    castUtf8() {
        return this;
    }
}

export class JavaConstantInteger extends JavaConstant {
    static TAG = 3;

    /**
     * @type {number}
     */
    integer;

    read(dataView, offset) {
        this.integer = dataView.getUint32(offset);
        offset += 4;
        return offset;
    }

    /**
     * @return {JavaConstantInteger}
     */
    castInteger() {
        return this;
    }

}

export class JavaConstantFloat extends JavaConstant {
    static TAG = 4;

    /**
     * @type {number}
     */
    float;

    read(dataView, offset) {
        this.float = dataView.getFloat32(offset);
        offset += 4;
        return offset;
    }

    /**
     * @return {JavaConstantFloat}
     */
    castFloat() {
        return this;
    }
}

export class JavaConstantLong extends JavaConstant {
    static TAG = 5;

    /**
     * @type {number}
     */
    long;

    read(dataView, offset) {
        this.long = dataView.getBigInt64(offset);
        offset += 8;
        return offset;
    }

    /**
     * @return {JavaConstantLong}
     */
    castLong() {
        return this;
    }
}

export class JavaConstantDouble extends JavaConstant {
    static TAG = 6;

    /**
     * @type {number}
     */
    double;

    read(dataView, offset) {
        this.double = dataView.getFloat64(offset);
        offset += 8;
        return offset;
    }

    /**
     * @return {JavaConstantDouble}
     */
    castDouble() {
        return this;
    }
}

export class JavaConstantClass extends JavaConstant {
    static TAG = 7;

    nameIndex;

    ref;

    /**
     * @return {string}
     */
    get name() {
        return this.pool.getUtf8(this.nameIndex)?.utf8;
    }

    /**
     * @return {Promise<JavaClass>}
     */
    async getClassRef() {
        if (this.ref == null) {
            this.ref = await this.pool.classLoader.loadClass(this.name);
        }
        return this.ref;
    }

    read(dataView, offset) {
        this.nameIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantClass}
     */
    castClass() {
        return this;
    }
}

export class JavaConstantString extends JavaConstant {
    static TAG = 8;

    utf8Index;

    ref;

    async getStringRef() {
        if (this.ref == null) {
            this.ref = await this.pool.classLoader.context.javaString(this.utf8);
        }
        return this.ref;
    }

    get utf8() {
        return this.pool.getUtf8(this.utf8Index)?.utf8;
    }

    read(dataView, offset) {
        this.utf8Index = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantString}
     */
    castString() {
        return this;
    }
}

export class JavaConstantFieldRef extends JavaConstant {
    static TAG = 9;

    classIndex;
    nameAndTypeIndex;

    ref;

    /**
     * @return {Promise<JavaField>}
     */
    async getFieldRef() {
        if (this.ref == null) {
            let classRef = await this.class.getClassRef();
            let nameAndType = this.nameAndType;
            this.ref = classRef.fieldMap.get(nameAndType.name + ":" + nameAndType.signature);
            if (this.ref == null) {
                let c = classRef;
                while (c != null) {
                    let f = c.fieldMap.get(nameAndType.name + ":" + nameAndType.signature);
                    if (f != null && (f.accessFlags & JavaAccessFlags.PRIVATE) === 0) {
                        this.ref = f;
                        break;
                    }
                    c = await c.getSuperClass();
                }
            }
            if (this.ref == null) {
                throw new Error(`class ${classRef.name} hasn't ${nameAndType.name}:${nameAndType.signature}`);
            }
        }
        return this.ref;
    }

    get class() {
        return this.pool.getClass(this.classIndex);
    }

    get nameAndType() {
        return this.pool.getNameAndType(this.nameAndTypeIndex);
    }

    read(dataView, offset) {
        this.classIndex = dataView.getUint16(offset);
        offset += 2;
        this.nameAndTypeIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantFieldRef}
     */
    castFieldRef() {
        return this;
    }
}

export class JavaConstantMethodRef extends JavaConstant {
    static TAG = 10;

    classIndex;
    nameAndTypeIndex;

    ref;

    /**
     * @return {Promise<JavaMethod>}
     */
    async getMethodRef() {
        if (this.ref == null) {
            let classRef = await this.class.getClassRef();
            let nameAndType = this.nameAndType;
            this.ref = classRef.methodMap.get(nameAndType.name + nameAndType.signature);
            if (this.ref == null) {
                let c = classRef;
                while (c != null) {
                    let m = c.methodMap.get(nameAndType.name + nameAndType.signature);
                    if (m != null && (m.accessFlags & (JavaAccessFlags.PRIVATE)) === 0) {
                        this.ref = m;
                        break;
                    }
                    c = await c.getSuperClass();
                }
            }
            if (this.ref == null) {
                throw new Error(`class ${classRef.name} hasn't ${nameAndType.name}${nameAndType.signature}`);
            }
        }
        return this.ref;
    }

    get class() {
        return this.pool.getClass(this.classIndex);
    }

    get nameAndType() {
        return this.pool.getNameAndType(this.nameAndTypeIndex);
    }

    read(dataView, offset) {
        this.classIndex = dataView.getUint16(offset);
        offset += 2;
        this.nameAndTypeIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantMethodRef}
     */
    castMethodRef() {
        return this;
    }
}

export class JavaConstantInterfaceMethod extends JavaConstant {
    static TAG = 11;

    classIndex;
    nameAndTypeIndex;

    ref;

    /**
     * @return {Promise<JavaMethod>}
     */
    async getInterfaceMethodRef() {
        if (this.ref == null) {
            let classRef = await this.class.getClassRef();
            let nameAndType = this.nameAndType;
            this.ref = classRef.methodMap.get(nameAndType.name + nameAndType.signature);
            if (this.ref == null) {
                let c = classRef;
                while (c != null) {
                    let m = c.methodMap.get(nameAndType.name + nameAndType.signature);
                    if (m != null && (m.accessFlags & (JavaAccessFlags.STATIC | JavaAccessFlags.PRIVATE)) === 0) {
                        this.ref = m;
                        break;
                    }
                    c = await c.getSuperClass();
                }
            }
            if (this.ref == null) {
                throw new Error(`class ${classRef.name} hasn't ${nameAndType.name}${nameAndType.signature}`);
            }
        }
        return this.ref;
    }

    get class() {
        return this.pool.getClass(this.classIndex);
    }

    get nameAndType() {
        return this.pool.getNameAndType(this.nameAndTypeIndex);
    }

    read(dataView, offset) {
        this.classIndex = dataView.getUint16(offset);
        offset += 2;
        this.nameAndTypeIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantInterfaceMethod}
     */
    castInterfaceMethod() {
        return this;
    }
}

export class JavaConstantNameAndType extends JavaConstant {
    static TAG = 12;

    nameIndex;
    signatureIndex;

    type;

    getSignatureType() {
        if (this.type == null) {
            let signature = this.signature;
            let type = new JavaType(signature);
            console.assert(type.length === signature.length);
            this.type = type;
        }
        return this.type;
    }

    get name() {
        return this.pool.getUtf8(this.nameIndex)?.utf8;
    }

    get signature() {
        return this.pool.getUtf8(this.signatureIndex)?.utf8;
    }

    read(dataView, offset) {
        this.nameIndex = dataView.getUint16(offset);
        offset += 2;
        this.signatureIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantNameAndType}
     */
    castNameAndType() {
        return this;
    }
}

export class JavaConstantMethodHandle extends JavaConstant {
    static TAG = 15;
    reference_kind;
    reference_index;

    read(dataView, offset) {
        this.reference_kind = dataView.getUint8(offset);
        offset += 1;
        this.reference_index = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantMethodHandle}
     */
    castMethodHandle() {
        return this;
    }
}

export class JavaConstantMethodType extends JavaConstant {
    static TAG = 16;

    descriptor_index;

    read(dataView, offset) {
        this.descriptor_index = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantMethodType}
     */
    castMethodType() {
        return this;
    }
}

export class JavaConstantDynamic extends JavaConstant {
    static TAG = 17;

    bootstrapMethodAttrIndex;
    nameAndTypeIndex;

    read(dataView, offset) {
        this.bootstrapMethodAttrIndex = dataView.getUint16(offset);
        offset += 2;
        this.nameAndTypeIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantDynamic}
     */
    castDynamic() {
        return this;
    }
}

export class JavaConstantInvokeDynamic extends JavaConstant {
    static TAG = 18;

    bootstrapMethodAttrIndex;
    nameAndTypeIndex;

    read(dataView, offset) {
        this.bootstrapMethodAttrIndex = dataView.getUint16(offset);
        offset += 2;
        this.nameAndTypeIndex = dataView.getUint16(offset);
        offset += 2;
        return offset;
    }

    /**
     * @return {JavaConstantInvokeDynamic}
     */
    castInvokeDynamic() {
        return this;
    }
}

let JavaConstantConstructorMap = Object.freeze(Object.assign([], {
    [JavaConstantUtf8.TAG]: JavaConstantUtf8,
    [JavaConstantInteger.TAG]: JavaConstantInteger,
    [JavaConstantFloat.TAG]: JavaConstantFloat,
    [JavaConstantLong.TAG]: JavaConstantLong,
    [JavaConstantDouble.TAG]: JavaConstantDouble,
    [JavaConstantClass.TAG]: JavaConstantClass,
    [JavaConstantString.TAG]: JavaConstantString,
    [JavaConstantFieldRef.TAG]: JavaConstantFieldRef,
    [JavaConstantMethodRef.TAG]: JavaConstantMethodRef,
    [JavaConstantInterfaceMethod.TAG]: JavaConstantInterfaceMethod,
    [JavaConstantNameAndType.TAG]: JavaConstantNameAndType,
    [JavaConstantMethodHandle.TAG]: JavaConstantMethodHandle,
    [JavaConstantMethodType.TAG]: JavaConstantMethodType,
    [JavaConstantDynamic.TAG]: JavaConstantDynamic,
    [JavaConstantInvokeDynamic.TAG]: JavaConstantInvokeDynamic,
}));

export class JavaConstantPool {
    /**
     * @param {JavaClassLoader} classLoader
     */
    constructor(classLoader) {
        this.classLoader = classLoader;
    }

    /**
     * @type {JavaClassLoader}
     */
    classLoader;

    /**
     * @type {JavaConstant[]}
     */
    pool;

    /**
     * @param {DataView} dataView
     * @param {number} offset
     * @return {number}
     */
    read(dataView, offset) {
        let count = dataView.getUint16(offset);
        offset += 2;
        let pool = this.pool = new Array(count);
        for (let i = 1; i < count; i++) {
            let tag = dataView.getUint8(offset);
            offset += 1;
            let constructor = JavaConstantConstructorMap[tag];
            if (constructor == null) {
                throw new Error(`Unknown ${tag}`);
            }
            let item = new constructor();
            item.pool = this;
            offset = item.read(dataView, offset);
            pool[i] = item;
            if (tag === JavaConstantLong.TAG || tag === JavaConstantDouble.TAG) {
                i++;
            }
        }
        return offset;
    }

    /**
     * @template {JavaConstant} T
     * @param {number} index
     * @return {T}
     */
    get(index) {
        return this.pool[index];
    }

    /**
     * @param {number} index
     * @return {JavaConstantUtf8}
     */
    getUtf8(index) {
        return this.get(index)?.castUtf8();
    }

    /**
     * @param {number} index
     * @return {JavaConstantInteger}
     */
    getInteger(index) {
        return this.get(index)?.castInteger();
    }

    /**
     * @param {number} index
     * @return {JavaConstantFloat}
     */
    getFloat(index) {
        return this.get(index)?.castFloat();
    }

    /**
     * @param {number} index
     * @return {JavaConstantLong}
     */
    getLong(index) {
        return this.get(index)?.castLong();
    }

    /**
     * @param {number} index
     * @return {JavaConstantDouble}
     */
    getDouble(index) {
        return this.get(index).castDouble();
    }

    /**
     * @param {number} index
     * @return {JavaConstantClass}
     */
    getClass(index) {
        return this.get(index)?.castClass();
    }

    /**
     * @param {number} index
     * @return {JavaConstantString}
     */
    getString(index) {
        return this.get(index)?.castString();
    }

    /**
     * @param {number} index
     * @return {JavaConstantFieldRef}
     */
    getFieldRef(index) {
        return this.get(index)?.castFieldRef();
    }

    /**
     * @param {number} index
     * @return {JavaConstantMethodRef}
     */
    getMethodRef(index) {
        return this.get(index)?.castMethodRef();
    }

    /**
     * @param {number} index
     * @return {JavaConstantInterfaceMethod}
     */
    getInterfaceMethod(index) {
        return this.get(index)?.castInterfaceMethod();
    }

    /**
     * @param {number} index
     * @return {JavaConstantNameAndType}
     */
    getNameAndType(index) {
        return this.get(index)?.castNameAndType();
    }

    /**
     * @param {number} index
     * @return {JavaConstantMethodHandle}
     */
    getMethodHandle(index) {
        return this.get(index)?.castMethodHandle();
    }

    /**
     * @param {number} index
     * @return {JavaConstantMethodType}
     */
    getMethodType(index) {
        return this.get(index)?.castMethodType();
    }

    /**
     * @param {number} index
     * @return {JavaConstantDynamic}
     */
    getDynamic(index) {
        return this.get(index)?.castDynamic();
    }

    /**
     * @param {number} index
     * @return {JavaConstantInvokeDynamic}
     */
    getInvokeDynamic(index) {
        return this.get(index)?.castInvokeDynamic();
    }

}
