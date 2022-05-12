import {Opcode, opcodeToString} from "./javaOpcode.js";
import {JavaAccessFlags, JavaClass, JavaClassLoader, JavaContext, JavaField, JavaMethod, JavaType} from "./javaContext.js";
import {
    JavaConstantClass, JavaConstantDouble,
    JavaConstantFloat,
    JavaConstantInteger, JavaConstantLong,
    JavaConstantPool,
    JavaConstantString
} from "./javaConstantPool.js";

export class JavaFileClassLoader extends JavaClassLoader {
    /**
     * @param {JavaClassLoader} parentClassLoader
     */
    constructor(parentClassLoader) {
        super(parentClassLoader);
    }

    /**
     * @param {DataView} dataView
     * @return {JavaClass}
     */
    defineClassFile(dataView) {
        let offset = 0;
        let magic = dataView.getUint32(offset);
        offset += 4;
        if (magic !== 0xCAFEBABE) {
            throw new Error();
        }
        let version = dataView.getUint32(offset);
        offset += 4;
        let constantPool = new JavaConstantPool(this);
        offset = constantPool.read(dataView, offset);
        let javaClass = new JavaFileClass(this);
        javaClass.context = this;
        javaClass.constantPool = constantPool;
        offset = javaClass.read(dataView, offset);
        console.assert(offset === dataView.byteLength);
        return this.defineClass(javaClass);
    }
}

export class FetchJavaClassLoader extends JavaFileClassLoader {
    /**
     * @param {JavaClassLoader} parentClassLoader
     */
    constructor(parentClassLoader) {
        super(parentClassLoader);
    }

    /**
     * @type {string}
     */
    urlBase = "rt/";

    /**
     * @param {string} name
     * @return {Promise<JavaClass>}
     */
    async findClass(name) {
        let superFindClass = await super.findClass(name);
        if (superFindClass != null) {
            return superFindClass;
        }
        let response = await fetch(this.urlBase + name + ".class");
        if (response.ok) {
            let arrayBuffer = await response.arrayBuffer();
            return this.defineClassFile(new DataView(arrayBuffer));
        } else {
            return null;
        }

    }

}

export class JavaFileClass extends JavaClass {

    /**
     * @param {JavaFileClassLoader} classLoader
     */
    constructor(classLoader) {
        super(classLoader);
    }

    /**
     * @type {JavaConstantPool}
     */
    constantPool;

    /**
     * @type {JavaConstantClass}
     */
    superClass;

    /**
     * @type {JavaConstantClass[]}
     */
    interfaces;

    /**
     * @return {Promise<void>}
     */
    async init() {
        await super.init();
        for (let i = 0; i < this.interfaces.length; i++) {
            let theI = this.interfaces[i];
            this.superClassAndInterfaceSet.add(await theI.getClassRef());
        }
    }

    /**
     * @param {DataView} dataView
     * @param {number} offset
     * @return {number}
     */
    read(dataView, offset) {
        this.accessFlags = dataView.getUint16(offset);
        offset += 2;
        this.name = this.constantPool.getClass(dataView.getUint16(offset)).name;
        offset += 2;
        this.superClass = this.constantPool.getClass(dataView.getUint16(offset));
        offset += 2;
        let interfaceCount = dataView.getUint16(offset);
        offset += 2;
        let interfaces = this.interfaces = new Array(interfaceCount);
        for (let i = 0; i < interfaceCount; i++) {
            interfaces[i] = this.constantPool.getClass(dataView.getUint16(offset));
            offset += 2;
        }
        this.fieldMap = new Map();
        let fieldCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < fieldCount; i++) {
            let field = new JavaFileField(this);
            offset = field.read(dataView, offset);
            if (this.fieldMap.has(field.name + ":" + field.descriptor)) {
                throw new Error();
            }
            this.fieldMap.set(field.name + ":" + field.descriptor, field);
        }
        this.methodMap = new Map();
        let methodCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < methodCount; i++) {
            let method = new JavaFileMethod(this);
            offset = method.read(dataView, offset);
            if (this.methodMap.has(method.name + method.descriptor)) {
                throw new Error();
            }
            this.methodMap.set(method.name + method.descriptor, method);
        }
        let attributeCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < attributeCount; i++) {
            let name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
            offset += 2;
            let length = dataView.getUint32(offset);
            offset += 4;
            let useOffset = offset + length;
            switch (name) {
                case "SourceFile":
                    console.assert(length === 2);
                    this.sourceFile = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
                    offset += 2;
                    break;
                default:
                    console.warn(`Unknown class attribute ${name} length ${length}`);
                    offset += length;
            }
            console.assert(useOffset === offset);
            offset = useOffset;
        }
        return offset;
    }

    /**
     * @return {Promise<JavaClass>}
     */
    async getSuperClass() {
        return await this.superClass?.getClassRef();
    }

}

export class JavaFileField extends JavaField {
    /**
     * @param {JavaFileClass} c
     */
    constructor(c) {
        super(c);
        this.constantPool = c.constantPool;
    }

    /**
     * @type {JavaConstantPool}
     */
    constantPool;

    read(dataView, offset) {
        this.accessFlags = dataView.getUint16(offset);
        offset += 2;
        this.name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
        offset += 2;
        this.descriptor = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
        offset += 2;
        this.type = new JavaType(this.descriptor);
        console.assert(this.type.length === this.descriptor.length);
        let attributeCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < attributeCount; i++) {
            let name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
            offset += 2;
            let length = dataView.getUint32(offset);
            offset += 4;
            let useOffset = offset + length;
            switch (name) {
                case "ConstantValue":
                    this.constantValue = this.constantPool.get(dataView.getUint16(offset));
                    offset += 2;
                    break;
                default:
                    console.warn(`Unknown field attribute ${name} length ${length}`);
                    offset += length;
            }
            console.assert(useOffset === offset);
            offset = useOffset;
        }
        return offset;
    }

}

export class JavaFileMethod extends JavaMethod {
    /**
     * @param {JavaFileClass} c
     */
    constructor(c) {
        super(c);
        this.constantPool = c.constantPool;
    }

    /**
     * @type {JavaConstantPool}
     */
    constantPool;

    code;

    exceptions;

    read(dataView, offset) {
        this.accessFlags = dataView.getUint16(offset);
        offset += 2;
        this.name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
        offset += 2;
        this.descriptor = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
        offset += 2;
        this.type = new JavaType(this.descriptor);
        this.descriptorParameter = this.type.parameterToString();
        console.assert(this.type.length === this.descriptor.length);
        let attributeCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < attributeCount; i++) {
            let name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
            offset += 2;
            let length = dataView.getUint32(offset);
            offset += 4;
            let useOffset = offset + length;
            switch (name) {
                case "Exceptions": {
                    let exceptionCount = dataView.getUint16(offset);
                    offset += 2;
                    let exceptions = this.exceptions = new Array(exceptionCount);
                    for (let i = 0; i < exceptionCount; i++) {
                        exceptions[i] = this.constantPool.getUtf8(this.constantPool.getClass(dataView.getUint16(offset)).nameIndex).utf8;
                        offset += 2;
                    }
                    break;
                }
                case "Code":
                    let code = this.code = new JavaFileCode(this);
                    code.method = this;
                    code.constantPool = this.constantPool;
                    offset = code.read(dataView, offset);
                    break;
                default:
                    console.warn(`Unknown class attribute ${name} length ${length}`);
                    offset += length;
            }
            console.assert(useOffset === offset);
            offset = useOffset;
        }
        return offset;
    }

    async invokeSpecial(...args) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        currentThread?.push(this.defineClass, this, this.defineClass.sourceFile, -1);
        try {
            if (JavaContext.DEBUG) {
                console.log("invokeSpecial", this.defineClass.name, this.name, this.descriptor, args);
            }
            await this.defineClass.tryInit();
            context.currentThread = currentThread;
            if (this.code != null) {
                return await this.code.invoke(...args);
            }
            if ((this.accessFlags & JavaAccessFlags.NATIVE) !== 0) {
                return await this.defineClass.classLoader.nativeCode(this, ...args);
            }
            throw new Error();
        } finally {
            currentThread?.pop();
            context.currentThread = currentThread;
            if (JavaContext.DEBUG) {
                console.log("exitSpecial", this.defineClass.name, this.name, this.descriptor);
            }
        }
    }

    async invokeStatic(...args) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        currentThread?.push(this.defineClass, this, this.defineClass.sourceFile, -1);
        try {
            if (JavaContext.DEBUG) {
                console.log("invokeStatic", this.defineClass.name, this.name, this.descriptor, args);
            }
            await this.defineClass.tryInit();
            context.currentThread = currentThread;
            if (this.code != null) {
                return await this.code.invoke(...args);
            }
            if ((this.accessFlags & JavaAccessFlags.NATIVE) !== 0) {
                return await this.defineClass.classLoader.nativeCode(this, ...args);
            }
            throw new Error();
        } finally {
            currentThread?.pop();
            context.currentThread = currentThread;
            if (JavaContext.DEBUG) {
                console.log("exitStatic", this.defineClass.name, this.name, this.descriptor);
            }
        }
    }

}

export class JavaFileExceptionTableItem {
    /**
     * @type {number}
     */
    startPc;
    /**
     * @type {number}
     */
    endPc;
    /**
     * @type {number}
     */
    handlerPc;
    /**
     * @type {JavaConstantClass}
     */
    catchType;
}

export class JavaFileCode {
    constructor(method) {
        this.method = method;
    }

    /**
     * @type {JavaFileMethod}
     */
    method;

    /**
     * @type {JavaConstantPool}
     */
    constantPool;

    /**
     * @type {number}
     */
    maxStack;

    /**
     * @type {number}
     */
    maxLocals;
    /**
     * @type {DataView}
     */
    code;

    /**
     * @type {JavaFileExceptionTableItem}
     */
    exceptions;

    /**
     * @param {DataView} dataView
     * @param {number} offset
     * @return {number}
     */
    read(dataView, offset) {
        this.maxStack = dataView.getUint16(offset);
        offset += 2;
        this.maxLocals = dataView.getUint16(offset);
        offset += 2;
        let codeLength = dataView.getUint32(offset);
        offset += 4;
        this.code = new DataView(dataView.buffer, dataView.byteOffset + offset, codeLength);
        offset += codeLength;
        let exceptionCount = dataView.getUint16(offset);
        offset += 2;
        let exceptions = this.exceptions = new Array(exceptionCount);
        for (let i = 0; i < exceptionCount; i++) {
            let item = exceptions[i] = new JavaFileExceptionTableItem();
            item.startPc = dataView.getUint16(offset);
            offset += 2;
            item.endPc = dataView.getUint16(offset);
            offset += 2;
            item.handlerPc = dataView.getUint16(offset);
            offset += 2;
            item.catchType = this.constantPool.getClass(dataView.getUint16(offset));
            offset += 2;
        }
        let attributeCount = dataView.getUint16(offset);
        offset += 2;
        for (let i = 0; i < attributeCount; i++) {
            let name = this.constantPool.getUtf8(dataView.getUint16(offset)).utf8;
            offset += 2;
            let length = dataView.getUint32(offset);
            offset += 4;
            let useOffset = offset + length;
            switch (name) {
                case "StackMapTable":
                case "LineNumberTable":
                    // todo
                    offset += length;
                    break;
                default:
                    console.warn(`Unknown code attribute ${name} length ${length}`);
                    offset += length;
            }
            console.assert(useOffset === offset);
            offset = useOffset;
        }
        return offset;
    }

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invoke(...args) {
        let context = this.method.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        if (JavaContext.DEBUG && false) {
            console.log("invoke", this.method, args);
        }
        let stack = new Array(this.maxStack);
        stack.length = 0;
        if (JavaContext.DEBUG) {
            let superPop = stack.pop;
            stack.pop = function pop(...values) {
                if (this.length === 0) {
                    throw new Error();
                }
                return superPop.call(this, ...values);
            };
        }
        let locals = new Array(this.maxLocals);
        locals.length = 0;
        if ((this.method.accessFlags & JavaAccessFlags.STATIC) === 0) {
            locals.push(args.shift());
        }
        for (let i = 0; i < this.method.type.P.length; i++) {
            locals.push(args[i]);
            let t = this.method.type.P[i].T;
            if (t === "D" || t === "J") {
                locals.push(null);
            }
        }
        locals.length = this.maxLocals;
        let pc = 0;
        let code = this.code;
        let constantPool = this.constantPool;
        let exceptions = this.exceptions;
        main: for (; ;) {
            try {
                let opcode = code.getUint8(pc++);
                if (JavaContext.DEBUG && false) {
                    console.log(opcodeToString(opcode), "pc", pc, "stack", stack, "locals", locals);
                }
                switch (opcode) {
                    case Opcode.nop:
                        break;
                    case Opcode.aconst_null:
                        stack.push(null);
                        break;
                    case Opcode.iconst_m1:
                        stack.push(-1);
                        break;
                    case Opcode.iconst_0:
                        stack.push(0);
                        break;
                    case Opcode.iconst_1:
                        stack.push(1);
                        break;
                    case Opcode.iconst_2:
                        stack.push(2);
                        break;
                    case Opcode.iconst_3:
                        stack.push(3);
                        break;
                    case Opcode.iconst_4:
                        stack.push(4);
                        break;
                    case Opcode.iconst_5:
                        stack.push(5);
                        break;
                    case Opcode.lconst_0:
                        stack.push(BigInt("0"));
                        stack.push(null);
                        break;
                    case Opcode.lconst_1:
                        stack.push(BigInt("1"));
                        stack.push(null);
                        break;
                    case Opcode.fconst_0:
                        stack.push(0);
                        break;
                    case Opcode.fconst_1:
                        stack.push(1);
                        break;
                    case Opcode.fconst_2:
                        stack.push(2);
                        break;
                    case Opcode.dconst_0:
                        stack.push(BigInt("0"));
                        stack.push(null);
                        break;
                    case Opcode.dconst_1:
                        stack.push(BigInt("1"));
                        stack.push(null);
                        break;
                    case Opcode.bipush: {
                        stack.push(code.getInt8(pc));
                        pc += 1;
                        break;
                    }
                    case Opcode.sipush: {
                        stack.push(code.getInt16(pc));
                        pc += 2;
                        break;
                    }
                    case Opcode.ldc: {
                        let constant = constantPool.get(code.getUint8(pc));
                        pc += 1;
                        let value;
                        switch (constant.tag) {
                            case JavaConstantString.TAG:
                                value = await constant.castString().getStringRef();
                                break;
                            case JavaConstantClass.TAG:
                                value = await (await constant.castClass().getClassRef()).getClassObject();
                                break;
                            case JavaConstantFloat.TAG:
                                value = constant.castFloat().float;
                                break;
                            case JavaConstantInteger.TAG:
                                value = constant.castInteger().integer;
                                break;
                            case JavaConstantDouble.TAG:
                                value = constant.castDouble().double;
                                break;
                            case JavaConstantLong.TAG:
                                value = constant.castLong().long;
                                break;
                            default:
                                throw new Error(`Unknown ldc ${constant.constructor.name}`);
                        }
                        stack.push(value);
                        if (constant.tag === JavaConstantDouble.TAG || constant.tag === JavaConstantLong.TAG) {
                            stack.push(null);
                        }
                        break;
                    }
                    case Opcode.ldc_w: {
                        let constant = constantPool.get(code.getUint16(pc));
                        pc += 2;
                        let value;
                        switch (constant.tag) {
                            case JavaConstantString.TAG:
                                value = await constant.castString().getStringRef();
                                break;
                            case JavaConstantClass.TAG:
                                value = await (await constant.castClass().getClassRef()).getClassObject();
                                break;
                            case JavaConstantFloat.TAG:
                                value = constant.castFloat().float;
                                break;
                            case JavaConstantInteger.TAG:
                                value = constant.castInteger().integer;
                                break;
                            case JavaConstantDouble.TAG:
                                value = constant.castDouble().double;
                                break;
                            case JavaConstantLong.TAG:
                                value = constant.castLong().long;
                                break;
                            default:
                                throw new Error(`Unknown ldc ${constant.constructor.name}`);
                        }
                        stack.push(value);
                        if (constant.tag === JavaConstantDouble.TAG || constant.tag === JavaConstantLong.TAG) {
                            stack.push(null);
                        }
                        break;
                    }
                    case Opcode.ldc2_w: {
                        let constant = constantPool.get(code.getUint16(pc));
                        pc += 2;
                        let value;
                        switch (constant.tag) {
                            case JavaConstantString.TAG:
                                value = await constant.castString().getStringRef();
                                break;
                            case JavaConstantClass.TAG:
                                value = await (await constant.castClass().getClassRef()).getClassObject();
                                break;
                            case JavaConstantFloat.TAG:
                                value = constant.castFloat().float;
                                break;
                            case JavaConstantInteger.TAG:
                                value = constant.castInteger().integer;
                                break;
                            case JavaConstantDouble.TAG:
                                value = constant.castDouble().double;
                                break;
                            case JavaConstantLong.TAG:
                                value = constant.castLong().long;
                                break;
                            default:
                                throw new Error(`Unknown ldc ${constant.constructor.name}`);
                        }
                        stack.push(value);
                        if (constant.tag === JavaConstantDouble.TAG || constant.tag === JavaConstantLong.TAG) {
                            stack.push(null);
                        }
                        break;
                    }
                    case Opcode.iload: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        stack.push(locals[index]);
                        break;
                    }
                    case Opcode.lload: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        stack.push(locals[index]);
                        stack.push(locals[index + 1]);
                        break;
                    }
                    case Opcode.fload: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        stack.push(locals[index]);
                        break;
                    }
                    case Opcode.dload: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        stack.push(locals[index]);
                        stack.push(locals[index + 1]);
                        break;
                    }
                    case Opcode.aload: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        stack.push(locals[index]);
                        break;
                    }
                    case Opcode.iload_0:
                        stack.push(locals[0]);
                        break;
                    case Opcode.iload_1:
                        stack.push(locals[1]);
                        break;
                    case Opcode.iload_2:
                        stack.push(locals[2]);
                        break;
                    case Opcode.iload_3:
                        stack.push(locals[3]);
                        break;
                    case Opcode.lload_0:
                        stack.push(locals[0]);
                        stack.push(locals[1]);
                        break;
                    case Opcode.lload_1:
                        stack.push(locals[1]);
                        stack.push(locals[2]);
                        break;
                    case Opcode.lload_2:
                        stack.push(locals[2]);
                        stack.push(locals[3]);
                        break;
                    case Opcode.lload_3:
                        stack.push(locals[3]);
                        stack.push(locals[4]);
                        break;
                    case Opcode.fload_0:
                        stack.push(locals[0]);
                        break;
                    case Opcode.fload_1:
                        stack.push(locals[1]);
                        break;
                    case Opcode.fload_2:
                        stack.push(locals[2]);
                        break;
                    case Opcode.fload_3:
                        stack.push(locals[3]);
                        break;
                    case Opcode.dload_0:
                        stack.push(locals[0]);
                        stack.push(locals[1]);
                        break;
                    case Opcode.dload_1:
                        stack.push(locals[1]);
                        stack.push(locals[2]);
                        break;
                    case Opcode.dload_2:
                        stack.push(locals[2]);
                        stack.push(locals[3]);
                        break;
                    case Opcode.dload_3:
                        stack.push(locals[3]);
                        stack.push(locals[4]);
                        break;
                    case Opcode.aload_0:
                        stack.push(locals[0]);
                        break;
                    case Opcode.aload_1:
                        stack.push(locals[1]);
                        break;
                    case Opcode.aload_2:
                        stack.push(locals[2]);
                        break;
                    case Opcode.aload_3:
                        stack.push(locals[3]);
                        break;
                    case Opcode.iaload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[I") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.laload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[J") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        stack.push(null);
                        break;
                    }
                    case Opcode.faload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[F") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.daload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[D") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        stack.push(null);
                        break;
                    }
                    case Opcode.aaload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        // todo
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.baload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[B") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.caload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[C") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.saload: {
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[S") {
                            throw new Error();
                        }
                        stack.push(array.nativeArray[index]);
                        break;
                    }
                    case Opcode.istore: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        locals[index] = stack.pop();
                        break;
                    }
                    case Opcode.lstore: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        locals[index + 1] = stack.pop();
                        locals[index] = stack.pop();
                        break;
                    }
                    case Opcode.fstore: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        locals[index] = stack.pop();
                        break;
                    }
                    case Opcode.dstore: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        locals[index + 1] = stack.pop();
                        locals[index] = stack.pop();
                        break;
                    }
                    case Opcode.astore: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        locals[index] = stack.pop();
                        break;
                    }
                    case Opcode.istore_0:
                        locals[0] = stack.pop();
                        break;
                    case Opcode.istore_1:
                        locals[1] = stack.pop();
                        break;
                    case Opcode.istore_2:
                        locals[2] = stack.pop();
                        break;
                    case Opcode.istore_3:
                        locals[3] = stack.pop();
                        break;
                    case Opcode.lstore_0:
                        locals[1] = stack.pop();
                        locals[0] = stack.pop();
                        break;
                    case Opcode.lstore_1:
                        locals[2] = stack.pop();
                        locals[1] = stack.pop();
                        break;
                    case Opcode.lstore_2:
                        locals[3] = stack.pop();
                        locals[2] = stack.pop();
                        break;
                    case Opcode.lstore_3:
                        locals[4] = stack.pop();
                        locals[3] = stack.pop();
                        break;
                    case Opcode.fstore_0:
                        locals[0] = stack.pop();
                        break;
                    case Opcode.fstore_1:
                        locals[1] = stack.pop();
                        break;
                    case Opcode.fstore_2:
                        locals[2] = stack.pop();
                        break;
                    case Opcode.fstore_3:
                        locals[3] = stack.pop();
                        break;
                    case Opcode.dstore_0:
                        locals[1] = stack.pop();
                        locals[0] = stack.pop();
                        break;
                    case Opcode.dstore_1:
                        locals[2] = stack.pop();
                        locals[1] = stack.pop();
                        break;
                    case Opcode.dstore_2:
                        locals[3] = stack.pop();
                        locals[2] = stack.pop();
                        break;
                    case Opcode.dstore_3:
                        locals[4] = stack.pop();
                        locals[3] = stack.pop();
                        break;
                    case Opcode.astore_0:
                        locals[0] = stack.pop();
                        break;
                    case Opcode.astore_1:
                        locals[1] = stack.pop();
                        break;
                    case Opcode.astore_2:
                        locals[2] = stack.pop();
                        break;
                    case Opcode.astore_3:
                        locals[3] = stack.pop();
                        break;
                    case Opcode.iastore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[I") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.lastore: {
                        stack.pop();
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[J") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.fastore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[F") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.dastore: {
                        stack.pop();
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[D") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.aastore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        // todo
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.bastore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[B") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.castore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[C") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.sastore: {
                        let value = stack.pop();
                        let index = stack.pop();
                        let array = stack.pop();
                        let arrayClass = array.javaClass;
                        if (arrayClass.name !== "[S") {
                            throw new Error();
                        }
                        array.nativeArray[index] = value;
                        break;
                    }
                    case Opcode.pop:
                        stack.pop();
                        break;
                    case Opcode.pop2:
                        stack.pop();
                        break;
                    case Opcode.dup:
                        let val = stack.pop();
                        stack.push(val);
                        stack.push(val);
                        break;
                    case Opcode.dup_x1: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        stack.push(val1);
                        stack.push(val2);
                        stack.push(val1);
                        break;
                    }
                    case Opcode.dup_x2: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        let val3 = stack.pop();
                        stack.push(val1);
                        stack.push(val3);
                        stack.push(val2);
                        stack.push(val1);
                        break;
                    }
                    case Opcode.dup2: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        stack.push(val2);
                        stack.push(val1);
                        stack.push(val2);
                        stack.push(val1);
                        break;
                    }
                    case Opcode.dup2_x1: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        let val3 = stack.pop();
                        stack.push(val2);
                        stack.push(val1);
                        stack.push(val3);
                        stack.push(val2);
                        stack.push(val1);
                        break;
                    }
                    case Opcode.dup2_x2: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        let val3 = stack.pop();
                        let val4 = stack.pop();
                        stack.push(val2);
                        stack.push(val1);
                        stack.push(val4);
                        stack.push(val3);
                        stack.push(val2);
                        stack.push(val1);
                        break;
                    }
                    case Opcode.swap: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        stack.push(val1);
                        stack.push(val2);
                        break;
                    }
                    case Opcode.iadd: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a + b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.ladd: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a + b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.fadd: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push(a + b);
                        break;
                    }
                    case Opcode.dadd: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(a + b);
                        stack.push(null);
                        break;
                    }
                    case Opcode.isub: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a - b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lsub: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a - b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.fsub: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push(a - b);
                        break;
                    }
                    case Opcode.dsub: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(a - b);
                        stack.push(null);
                        break;
                    }
                    case Opcode.imul: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a * b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lmul: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a * b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.fmul: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push(a * b);
                        break;
                    }
                    case Opcode.dmul: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(a * b);
                        stack.push(null);
                        break;
                    }
                    case Opcode.idiv: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a / b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.ldiv: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a / b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.fdiv: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push(a / b);
                        break;
                    }
                    case Opcode.ddiv: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(a / b);
                        stack.push(null);
                        break;
                    }
                    case Opcode.irem: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a % b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lrem: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a % b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.frem: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push(a % b);
                        break;
                    }
                    case Opcode.drem: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(a % b);
                        stack.push(null);
                        break;
                    }
                    case Opcode.ineg: {
                        let a = stack.pop();
                        stack.push(-a);
                        break;
                    }
                    case Opcode.lneg: {
                        stack.pop();
                        let a = stack.pop();
                        stack.push(-a);
                        stack.push(null);
                        break;
                    }
                    case Opcode.fneg: {
                        let a = stack.pop();
                        stack.push(-a);
                        break;
                    }
                    case Opcode.dneg: {
                        stack.pop();
                        let a = stack.pop();
                        stack.push(-a);
                        stack.push(null);
                        break;
                    }
                    case Opcode.ishl: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a << b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lshl: {
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a << BigInt(b)));
                        stack.push(null);
                        break;
                    }
                    case Opcode.ishr: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a >> b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lshr: {
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a >> BigInt(b)));
                        stack.push(null);
                        break;
                    }
                    case Opcode.iushr: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a >>> b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lushr: {
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, (a & BigInt("0xFFFFFFFFFFFFFFFF")) >> BigInt(b)));
                        stack.push(null);
                        break;
                    }
                    case Opcode.iand: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a & b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.land: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a & b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.ior: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a | b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lor: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a | b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.ixor: {
                        let b = stack.pop();
                        let a = stack.pop();
                        stack.push((a ^ b) & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.lxor: {
                        stack.pop();
                        let b = stack.pop();
                        stack.pop();
                        let a = stack.pop();
                        stack.push(BigInt.asIntN(64, a ^ b));
                        stack.push(null);
                        break;
                    }
                    case Opcode.iinc: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        let value = code.getInt8(pc);
                        pc += 1;
                        locals[index] += value;
                        break;
                    }
                    case Opcode.i2l: {
                        let value = stack.pop();
                        stack.push(BigInt.asIntN(64, BigInt(value)));
                        stack.push(null);
                        break;
                    }
                    case Opcode.i2f : {
                        let value = stack.pop();
                        stack.push(value);
                        break;
                    }
                    case Opcode.i2d: {
                        let value = stack.pop();
                        stack.push(value);
                        stack.push(null);
                        break;
                    }
                    case Opcode.l2i: {
                        stack.pop();
                        let value = stack.pop();
                        stack.push(Number(value));
                        // fixme
                        break;
                    }
                    case Opcode.l2f: {
                        stack.pop();
                        let value = stack.pop();
                        stack.push(Number(value));
                        // fixme
                        break;
                    }
                    case Opcode.l2d: {
                        stack.pop();
                        let value = stack.pop();
                        stack.push(Number(value));
                        stack.push(null);
                        break;
                    }
                    case Opcode.f2i : {
                        let value = stack.pop();
                        stack.push(value & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.f2l : {
                        let value = stack.pop();
                        stack.push(BigInt.asIntN(64, BigInt(value)));
                        stack.push(null)
                        break;
                    }
                    case Opcode.f2d : {
                        let value = stack.pop();
                        stack.push(value);
                        stack.push(null)
                        break;
                    }
                    case Opcode.d2i : {
                        stack.pop();
                        let value = stack.pop();
                        if (value > 0x7FFFFFFF) {
                            value = 0x7FFFFFFF;
                        }
                        if (value < (0x80000000 & 0xFFFFFFFF)) {
                            value = (0x80000000 & 0xFFFFFFFF);
                        }
                        stack.push(value & 0xFFFFFFFF);
                        break;
                    }
                    case Opcode.d2l : {
                        stack.pop();
                        let value = stack.pop();
                        stack.push(BigInt.asIntN(64, BigInt(value)));
                        break;
                    }
                    case Opcode.d2f : {
                        stack.pop();
                        let value = stack.pop();
                        stack.push(value);
                        break;
                    }
                    case Opcode.i2b : {
                        let value = stack.pop();
                        stack.push(((value & 0xFFFFFFFF) << 24) >> 24);
                        break;
                    }
                    case Opcode.i2c : {
                        let value = stack.pop();
                        stack.push(((value & 0xFFFFFFFF) << 16) >>> 16);
                        break;
                    }
                    case Opcode.i2s : {
                        let value = stack.pop();
                        stack.push(((value & 0xFFFFFFFF) << 16) >> 16);
                        break;
                    }
                    case Opcode.lcmp: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        if (val2 > val1) {
                            stack.push(1);
                        } else if (val2 < val1) {
                            stack.push(-1);
                        } else {
                            stack.push(0);
                        }
                        break;
                    }
                    case Opcode.fcmpl: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        if (Number.isNaN(val1) || Number.isNaN(val2)) {
                            stack.push(-1);
                        } else if (val2 > val1) {
                            stack.push(1);
                        } else if (val2 < val1) {
                            stack.push(-1);
                        } else {
                            stack.push(0);
                        }
                        break;
                    }
                    case Opcode.fcmpg: {
                        let val1 = stack.pop();
                        let val2 = stack.pop();
                        if (Number.isNaN(val1) || Number.isNaN(val2)) {
                            stack.push(1);
                        } else if (val2 > val1) {
                            stack.push(1);
                        } else if (val2 < val1) {
                            stack.push(-1);
                        } else {
                            stack.push(0);
                        }
                        break;
                    }
                    case Opcode.dcmpl: {
                        stack.pop();
                        let val1 = stack.pop();
                        stack.pop();
                        let val2 = stack.pop();
                        if (Number.isNaN(val1) || Number.isNaN(val2)) {
                            stack.push(-1);
                        } else if (val2 > val1) {
                            stack.push(1);
                        } else if (val2 < val1) {
                            stack.push(-1);
                        } else {
                            stack.push(0);
                        }
                        break;
                    }
                    case Opcode.dcmpg: {
                        stack.pop();
                        let val1 = stack.pop();
                        stack.pop();
                        let val2 = stack.pop();
                        if (Number.isNaN(val1) || Number.isNaN(val2)) {
                            stack.push(1);
                        } else if (val2 > val1) {
                            stack.push(1);
                        } else if (val2 < val1) {
                            stack.push(-1);
                        } else {
                            stack.push(0);
                        }
                        break;
                    }
                    case Opcode.ifeq: {
                        let value = stack.pop();
                        if (value === 0 || value === false) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.ifne: {
                        if (stack.pop() !== 0) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.iflt: {
                        if (stack.pop() < 0) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.ifge: {
                        if (stack.pop() >= 0) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.ifgt: {
                        if (stack.pop() > 0) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.ifle: {
                        if (stack.pop() <= 0) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmpeq: {
                        if (stack.pop() === stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmpne : {
                        if (stack.pop() !== stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmplt: {
                        if (stack.pop() > stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmpge: {
                        if (stack.pop() <= stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmpgt: {
                        if (stack.pop() < stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_icmple : {
                        if (stack.pop() >= stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_acmpeq: {
                        if (stack.pop() === stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.if_acmpne: {
                        if (stack.pop() !== stack.pop()) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.goto:
                        pc += code.getInt16(pc) - 1;
                        break;
                    case Opcode.jsr: {
                        let jmp = code.getInt16(pc);
                        pc += 2;
                        stack.push(pc);
                        pc = jmp;
                        break;
                    }
                    case Opcode.ret: {
                        let index = code.getUint8(pc);
                        pc += 1;
                        pc = locals[index];
                        break;
                    }
                    case Opcode.tableswitch: {
                        let startPc = pc;

                        while ((pc % 4) !== 0) {
                            pc++;
                        }

                        let defaultPc = code.getInt32(pc);
                        pc += 4;
                        let lowValue = code.getInt32(pc);
                        pc += 4;
                        let highValue = code.getInt32(pc);
                        pc += 4;
                        let value = stack.pop();

                        let jmp;
                        if (value < lowValue || value > highValue) {
                            jmp = defaultPc;
                        } else {
                            pc += (value - lowValue) * 4;
                            jmp = code.getInt32(pc);
                            pc += 4;
                        }

                        pc = startPc + jmp - 1;
                        break;
                    }
                    case Opcode.lookupswitch: {
                        let startPc = pc;

                        while ((pc % 4) !== 0) {
                            pc++;
                        }

                        let jmp = code.getInt32(pc);
                        pc += 4;
                        let size = code.getInt32(pc);
                        pc += 4;
                        let val = stack.pop();

                        for (let i = 0; i < size; i++) {
                            let key = code.getInt32(pc);
                            pc += 4;
                            let offset = code.getInt32(pc);
                            pc += 4;
                            if (key === val) {
                                jmp = offset;
                            }
                            if (key >= val) {
                                break;
                            }
                        }
                        pc = startPc + jmp - 1;
                        break;
                    }
                    case Opcode.ireturn:
                        return stack.pop();
                    case Opcode.lreturn:
                        stack.pop();
                        return stack.pop();
                    case Opcode.freturn:
                        return stack.pop();
                    case Opcode.dreturn:
                        stack.pop();
                        return stack.pop();
                    case Opcode.areturn:
                        return stack.pop();
                    case Opcode.return:
                        return;
                    case Opcode.getstatic: {
                        let fieldRef = await constantPool.getFieldRef(code.getUint16(pc)).getFieldRef();
                        pc += 2;
                        let t = fieldRef.type;
                        let value = await fieldRef.getStatic();
                        stack.push(value);
                        if (t.T === "D" || t.T === "J") {
                            stack.push(null);
                        }
                        break;
                    }
                    case Opcode.putstatic: {
                        let fieldRef = await constantPool.getFieldRef(code.getUint16(pc)).getFieldRef();
                        pc += 2;
                        let t = fieldRef.type;
                        if (t.T === "D" || t.T === "J") {
                            stack.pop();
                        }
                        let value = stack.pop();
                        await fieldRef.pusStatic(value);
                        break;
                    }
                    case Opcode.getfield: {
                        let field = await this.constantPool.getFieldRef(code.getUint16(pc)).getFieldRef();
                        pc += 2;
                        let object = stack.pop();
                        stack.push(await field.getField(object));
                        break;
                    }
                    case Opcode.putfield: {
                        let fieldRef = await constantPool.getFieldRef(code.getUint16(pc)).getFieldRef();
                        pc += 2;
                        let t = fieldRef.type;
                        if (t.T === "D" || t.T === "J") {
                            stack.pop();
                        }
                        let value = stack.pop();
                        let object = stack.pop();
                        await fieldRef.putField(object, value);
                        break;
                    }
                    case Opcode.invokevirtual: {
                        let methodRef = await constantPool.getMethodRef(code.getUint16(pc)).getMethodRef();
                        pc += 2;
                        let args = new Array(methodRef.type.P.length + 1);
                        for (let i = methodRef.type.P.length; i > 0; i--) {
                            let t = methodRef.type.P[i - 1].T;
                            if (t === "D" || t === "J") {
                                stack.pop();
                            }
                            args[i] = stack.pop();
                        }
                        args[0] = stack.pop();
                        context.currentThread = currentThread;
                        let returned = await methodRef.invokeVirtual(...args);
                        let r = methodRef.type.R.T;
                        if (r !== "V") {
                            stack.push(returned);
                            if (r === "D" || r === "J") {
                                stack.push(null);
                            }
                        }
                        break;
                    }
                    case Opcode.invokespecial: {
                        let methodRef = await constantPool.getMethodRef(code.getUint16(pc)).getMethodRef();
                        pc += 2;
                        let args = new Array(methodRef.type.P.length + 1);
                        for (let i = methodRef.type.P.length; i > 0; i--) {
                            let t = methodRef.type.P[i - 1].T;
                            if (t === "D" || t === "J") {
                                stack.pop();
                            }
                            args[i] = stack.pop();
                        }
                        args[0] = stack.pop();
                        context.currentThread = currentThread;
                        let returned = await methodRef.invokeSpecial(...args);
                        let r = methodRef.type.R.T;
                        if (r !== "V") {
                            stack.push(returned);
                            if (r === "D" || r === "J") {
                                stack.push(null);
                            }
                        }
                        break;
                    }
                    case Opcode.invokestatic: {
                        let methodRef = await constantPool.getMethodRef(code.getUint16(pc)).getMethodRef();
                        pc += 2;
                        let args = new Array(methodRef.type.P.length);
                        for (let i = methodRef.type.P.length - 1; i >= 0; i--) {
                            let t = methodRef.type.P[i].T;
                            if (t === "D" || t === "J") {
                                stack.pop();
                            }
                            args[i] = stack.pop();
                        }
                        context.currentThread = currentThread;
                        let returned = await methodRef.invokeStatic(...args);
                        let r = methodRef.type.R.T;
                        if (r !== "V") {
                            stack.push(returned);
                            if (r === "D" || r === "J") {
                                stack.push(null);
                            }
                        }
                        break;
                    }
                    case Opcode.invokeinterface: {
                        let methodRef = await constantPool.getInterfaceMethod(code.getUint16(pc)).getInterfaceMethodRef();
                        pc += 2;
                        let argCount = code.getUint8(pc);
                        pc += 1;
                        let zero = code.getUint8(pc);
                        pc += 1;
                        let args = new Array(methodRef.type.P.length + 1);
                        for (let i = methodRef.type.P.length; i > 0; i--) {
                            let t = methodRef.type.P[i - 1].T;
                            if (t === "D" || t === "J") {
                                stack.pop();
                            }
                            args[i] = stack.pop();
                        }
                        args[0] = stack.pop();
                        context.currentThread = currentThread;
                        let returned = await methodRef.invokeVirtual(...args);
                        let r = methodRef.type.R.T;
                        if (r !== "V") {
                            stack.push(returned);
                            if (r === "D" || r === "J") {
                                stack.push(null);
                            }
                        }
                        break;
                    }
                    case Opcode.new:
                        stack.push(await (await constantPool.getClass(code.getUint16(pc)).getClassRef()).newInstance());
                        pc += 2;
                        break;
                    case Opcode.newarray: {
                        let type = code.getUint8(pc);
                        pc += 1;
                        let length = stack.pop();
                        let array;
                        let c;
                        switch (type) {
                            case 4:
                                c = "Z";
                                break;
                            case 5:
                                c = "C";
                                break;
                            case 6:
                                c = "F";
                                break;
                            case 7:
                                c = "D";
                                break;
                            case 8:
                                c = "B";
                                break;
                            case 9:
                                c = "S";
                                break;
                            case 10:
                                c = "I";
                                break;
                            case 11:
                                c = "J";
                                break;
                            default:
                                throw new Error();
                        }
                        context.currentThread = currentThread;
                        array = await context.getPrimitiveClass(c).newArray(length);
                        stack.push(array);
                        break;
                    }
                    case Opcode.anewarray: {
                        let type = await this.constantPool.getClass(code.getUint16(pc)).getClassRef();
                        pc += 2;
                        let length = stack.pop();
                        context.currentThread = currentThread;
                        let array = await type.newArray(length);
                        stack.push(array);
                        break;
                    }
                    case Opcode.arraylength: {
                        let array = stack.pop();
                        stack.push(array.nativeArray.length);
                        break;
                    }
                    case Opcode.athrow: {
                        throw stack.pop();
                    }
                    case Opcode.checkcast: {
                        let type = await constantPool.getClass(code.getUint16(pc)).getClassRef();
                        pc += 2;
                        let obj = stack.pop();
                        context.currentThread = currentThread;
                        stack.push(type.checkCast(obj));
                        break;
                    }
                    case Opcode.instanceof: {
                        let type = await constantPool.getClass(code.getUint16(pc)).getClassRef();
                        pc += 2;
                        let object = stack.pop();
                        context.currentThread = currentThread;
                        stack.push(type.instanceOf(object));
                        break;
                    }
                    case Opcode.monitorenter:
                        stack.pop();
                        // todo
                        break;
                    case Opcode.monitorexit :
                        stack.pop();
                        // todo
                        break;
                    case Opcode.wide: {
                        opcode = code.getUint8(pc++);
                        switch (opcode) {
                            case Opcode.iload: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                stack.push(locals[index]);
                                break;
                            }
                            case Opcode.lload: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                stack.push(locals[index]);
                                stack.push(locals[index + 1]);
                                break;
                            }
                            case Opcode.fload: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                stack.push(locals[index]);
                                break;
                            }
                            case Opcode.dload: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                stack.push(locals[index]);
                                stack.push(locals[index + 1]);
                                break;
                            }
                            case Opcode.aload: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                stack.push(locals[index]);
                                break;
                            }
                            case Opcode.istore: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                locals[index] = stack.pop();
                                break;
                            }
                            case Opcode.lstore: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                locals[index + 1] = stack.pop();
                                locals[index] = stack.pop();
                                break;
                            }
                            case Opcode.fstore: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                locals[index] = stack.pop();
                                break;
                            }
                            case Opcode.dstore: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                locals[index + 1] = stack.pop();
                                locals[index] = stack.pop();
                                break;
                            }
                            case Opcode.astore: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                locals[index] = stack.pop();
                                break;
                            }
                            case Opcode.iinc: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                let value = code.getInt16(pc);
                                pc += 2;
                                locals[index] += value;
                                break;
                            }
                            case Opcode.ret: {
                                let index = code.getUint16(pc);
                                pc += 2;
                                pc = locals[index];
                                break;
                            }
                            default:
                                throw new Error();
                        }
                        break;
                    }
                    case Opcode.multianewarray: {
                        let type = await this.constantPool.getClass(code.getUint16(pc)).getClassRef();
                        pc += 2;
                        let dimensions = code.getUint8(pc);
                        pc += 1;
                        let lengths = new Array(dimensions);
                        for (let i = dimensions - 1; i >= 0; i--) {
                            lengths[i] = stack.pop();
                        }
                        context.currentThread = currentThread;
                        let array = await type.newArray(...lengths);
                        stack.push(array);
                        break;
                    }
                    case Opcode.ifnull : {
                        let object = stack.pop();
                        if (object == null) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.ifnonnull: {
                        let object = stack.pop();
                        if (object != null) {
                            pc += code.getInt16(pc) - 1;
                        } else {
                            pc += 2;
                        }
                        break;
                    }
                    case Opcode.goto_w:
                        pc += code.getInt32(pc) - 1;
                        break;
                    case Opcode.jsr_w: {
                        let jmp = code.getInt32(pc);
                        pc += 2;
                        stack.push(pc);
                        pc = jmp;
                        break;
                    }
                    default:
                        throw new Error(`Unknown opcode ${opcodeToString(opcode)} ${opcode}`);
                }
            } catch (e) {
                if (e.javaClass != null) {
                    for (let i = 0; i < exceptions.length; i++) {
                        if (pc >= exceptions[i].startPc && pc <= exceptions[i].endPc) {
                            let catchType = exceptions[i].catchType;
                            if (catchType == null || (await catchType.getClassRef()).instanceOf(e)) {
                                pc = exceptions[i].handlerPc;
                                stack.push(e);
                                continue main;
                            }
                        }
                    }
                }
                throw e;
            } finally {
                context.currentThread = currentThread;
            }
        }

    }

}

