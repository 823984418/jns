import {
    JavaConstantClass,
    JavaConstantDouble,
    JavaConstantFloat,
    JavaConstantInteger,
    JavaConstantLong,
    JavaConstantString
} from "./javaConstantPool.js";

/**
 * no instance
 */
export class JavaObject {

    /**
     * @type {JavaClass}
     */
    javaClass;

    /**
     * used in java.lang.Class
     * @type {JavaClass}
     */
    nativeClass;

    /**
     * used in java.lang.Thread
     * @type {JavaThread}
     */
    nativeThread;

    /**
     * used in array
     * @type {JavaObject[] | boolean[] | Int8Array | Int16Array | Uint16Array | Int32Array | BigInt64Array | Float32Array | Float64Array}
     */
    nativeArray;

    /**
     * used in java.lang.ClassLoader
     * @type {JavaClassLoader}
     */
    nativeClassLoader;

    /**
     * used in java.lang.Throwable
     * @type {Error}
     */
    jsError;
}

export class JavaThread {
    /**
     * @param {JavaObject} javaObject
     */
    constructor(javaObject) {
        this.javaObject = javaObject;
        javaObject.nativeThread = this;
        this.stack = [];
    }

    /**
     * @type {JavaObject}
     */
    javaObject;

    /**
     * @type {{declaringClass: JavaClass, method: JavaMethod, file: string, line: number}[]}
     */
    stack;


    /**
     * @param {JavaClass} declaringClass
     * @param {JavaMethod} method
     * @param {string} file
     * @param {number} line
     */
    push(declaringClass, method, file, line) {
        this.stack.unshift({
            declaringClass: declaringClass,
            method: method,
            file: file,
            line: line,
        });
    }

    pop() {
        return this.stack.shift();
    }

    async getStackTraceElementArray() {
        let classLoader = this.javaObject.javaClass.classLoader;
        let context = classLoader.context;
        let stackTraceElementClass = await classLoader.loadClass("java/lang/StackTraceElement");
        let array = await stackTraceElementClass.newArray(this.stack.length);
        for (let i = 0; i < this.stack.length; i++) {
            let nItem = this.stack[i];
            array.nativeArray[i] = await classLoader.newInstanceWith("java/lang/StackTraceElement",
                "Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I",
                await context.javaString(nItem.declaringClass.name.replaceAll("/", ".")),
                await context.javaString(nItem.method.name),
                await context.javaString(nItem.file),
                nItem.line,
            );
        }
        return array;
    }
}

export class JavaAccessFlags {
    /** class, field, method */
    static PUBLIC = 0x0001;
    /** class, field, method */
    static PRIVATE = 0x0002;
    /** class, field, method */
    static PROTECTED = 0x0004;
    /** field, method */
    static STATIC = 0x0008;
    /** class, field, method, parameter */
    static FINAL = 0x0010;
    /** class */
    static SUPER = 0x0020;
    /** method */
    static SYNCHRONIZED = 0x0020;
    /** module */
    static OPEN = 0x0020;
    /** module requires */
    static TRANSITIVE = 0x0020;
    /** field */
    static VOLATILE = 0x0040;
    /** method */
    static BRIDGE = 0x0040;
    /** module requires */
    static STATIC_PHASE = 0x0040;
    /** method */
    static VARARGS = 0x0080;
    /** field */
    static TRANSIENT = 0x0080;
    /** method */
    static NATIVE = 0x0100;
    /** class */
    static INTERFACE = 0x0200;
    /** class, method */
    static ABSTRACT = 0x0400;
    /** method */
    static STRICT = 0x0800;
    /** class, field, method, parameter, module * */
    static SYNTHETIC = 0x1000;
    /** class */
    static ANNOTATION = 0x2000;
    /** class(?) field inner */
    static ENUM = 0x4000;
    /** field, method, parameter, module, module * */
    static MANDATED = 0x8000;
    /** class */
    static MODULE = 0x8000;
}

export class JavaType {
    static BASE_TAG = 0;
    static CLASS_TAG = 1;
    static ARRAY_TAG = 2;
    static METHOD_TYPE = 3;

    constructor(descriptor) {
        switch (descriptor.charAt(0)) {
            case "Z":
            case "B":
            case "C":
            case "D":
            case "F":
            case "I":
            case "J":
            case "S":
            case "V":
                this.tag = JavaType.BASE_TAG;
                this.T = descriptor.charAt(0);
                this.length = 1;
                break;
            case "L": {
                let index = descriptor.indexOf(";");
                this.tag = JavaType.CLASS_TAG;
                this.L = descriptor.substring(1, index);
                this.length = index + 1;
                break;
            }
            case "[": {
                descriptor = descriptor.substring(1);
                let type = new JavaType(descriptor);
                this.tag = JavaType.ARRAY_TAG;
                this.A = type;
                this.length = type.length + 1;
                break;
            }
            case "(": {
                let length = 0;
                descriptor = descriptor.substring(1);
                length += 1;
                let parameter = [];
                while (descriptor.charAt(0) !== ")") {
                    let type = new JavaType(descriptor);
                    descriptor = descriptor.substring(type.length);
                    length += type.length;
                    parameter.push(type);
                }
                descriptor = descriptor.substring(1);
                length += 1
                let returned = new JavaType(descriptor);
                length += returned.length;
                this.tag = JavaType.METHOD_TYPE;
                this.P = parameter;
                this.R = returned;
                this.length = length;
                break;
            }
            default:
                throw new Error();
        }
    }

    /**
     * @type {number}
     */
    tag;

    T;
    L;
    A;
    /**
     * @type {JavaType[]}
     */
    P;
    /**
     * @type {JavaType}
     */
    R;

    /**
     * @type {number}
     */
    length;

    parameterToString() {
        return this.P.map(v => v.toString()).join("");
    }

    toString() {
        switch (this.tag) {
            case JavaType.BASE_TAG:
                return this.T;
            case JavaType.CLASS_TAG:
                return `L${this.L};`;
            case JavaType.ARRAY_TAG:
                return `[${this.A}`;
            case JavaType.METHOD_TYPE:
                return `(${this.parameterToString()})${this.R}`;
        }
    }

}

export class JavaContext {
    static DEBUG = false;
    static JS_CLASS_LOADER_NAME = "jns/JsClassLoader";
    static USE_JAVA_ERROR = true;

    constructor() {

    }


    /**
     * @param {JavaObject} object
     * @param {BigInt} time
     * @return {Promise<void>}
     */
    async waitObject(object, time) {
        debugger;
        // fixme
    }

    /**
     * @type {JavaClassLoader}
     */
    rootClassLoader;

    /**
     * @type {Map<string, JavaClass>}
     */
    primitiveClassMap;

    /**
     * @param {string} name
     * @return {JavaClass}
     */
    getPrimitiveClass(name) {
        return this.primitiveClassMap.get(name);
    }

    /**
     * @param {JavaClassLoader} classLoader
     */
    setRootClassLoader(classLoader) {
        if (this.rootClassLoader != null || classLoader.context != null) {
            throw new Error();
        }
        this.rootClassLoader = classLoader;
        classLoader.context = this;
    }

    /**
     * @type {JavaThread}
     */
    currentThread;

    /**
     * @type {JavaThread}
     */
    mainThread;

    async init() {
        let rootClassLoader = this.rootClassLoader;
        if (rootClassLoader == null) {
            throw new Error();
        }
        let primitiveClassMap = this.primitiveClassMap = new Map();
        ["Z", "B", "C", "D", "F", "I", "J", "S", "V"].forEach(name => {
            let c = new JavaPrimitiveClass(this.rootClassLoader, name);
            primitiveClassMap.set(name, c);
        });

        rootClassLoader.defineNativeCode("java/lang/Object#registerNatives()V", async () => {
            rootClassLoader.defineNativeCode("java/lang/Object#hashCode()I", async (object) => {
                if (object.hashCode == null) {
                    object.hashCode = (Math.random() * 0xFFFFFFFF) & 0xFFFFFFFF;
                }
                return object.hashCode;
            });
            rootClassLoader.defineNativeCode("java/lang/Object#getClass()Ljava/lang/Class;", async (object) => {
                return await object.javaClass.getClassObject();
            });
            rootClassLoader.defineNativeCode("java/lang/Object#wait(J)V", async (thisObject, time) => {
                await this.waitObject(thisObject, time);
            });
        });
        rootClassLoader.defineNativeCode("java/lang/Class#registerNatives()V", async () => {
            rootClassLoader.defineNativeCode("java/lang/Class#getName0()Ljava/lang/String;", async (object) => {
                let name = object.nativeClass.name.replaceAll("/", ".");
                return await this.javaString(name);
            });
            rootClassLoader.defineNativeCode("java/lang/Class#desiredAssertionStatus0(Ljava/lang/Class;)Z", async (object) => {
                return object.javaClass.hasInit;
            });
            rootClassLoader.defineNativeCode("java/lang/Class#getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;", async (name) => {
                let jsName = await this.jsString(name);
                let baseName = {
                    "boolean": "Z",
                    "byte": "B",
                    "char": "C",
                    "double": "D",
                    "float": "F",
                    "int": "I",
                    "long": "J",
                    "short": "S",
                    "void": "V",
                }[jsName];
                let c = this.getPrimitiveClass(baseName);
                if (c == null) {
                    throw new Error();
                }
                return await c.getClassObject();
            });
            rootClassLoader.defineNativeCode("java/lang/Class#getComponentType()Ljava/lang/Class;", async (thisObject) => {
                return thisObject.nativeClass.containClass.getClassObject();
            });
            rootClassLoader.defineNativeCode("java/lang/Class#isArray()Z", async (thisObject) => {
                return thisObject.nativeClass.containClass != null;
            });
            rootClassLoader.defineNativeCode("java/lang/Class#isPrimitive()Z", async (thisObject) => {
                return thisObject.nativeClass.primitiveName != null;
            });
            rootClassLoader.defineNativeCode("java/lang/Class#isInterface()Z", async (thisObject) => {
                return (thisObject.nativeClass.accessFlags & JavaAccessFlags.INTERFACE) !== 0;
            });
        });
        rootClassLoader.defineNativeCode("java/lang/ClassLoader#registerNatives()V", async () => {
        });
        rootClassLoader.defineNativeCode("java/lang/System#registerNatives()V", async () => {
            rootClassLoader.defineNativeCode("java/lang/System#identityHashCode(Ljava/lang/Object;)I", async (object) => {
                if (object.hashCode == null) {
                    object.hashCode = (Math.random() * 0xFFFFFFFF) & 0xFFFFFFFF;
                }
                return object.hashCode;
            });
        });
        rootClassLoader.defineNativeCode("sun/misc/Unsafe#registerNatives()V", async () => {
        });
        rootClassLoader.defineNativeCode("java/lang/Thread#setPriority0(I)V", async (thread, priority) => {
        });
        rootClassLoader.defineNativeCode("sun/misc/VM#initialize()V", async () => {
        });
        rootClassLoader.defineNativeCode("java/lang/String#intern()Ljava/lang/String;", async (thisObject) => {
            // todo
            return thisObject;
        });
        rootClassLoader.defineNativeCode("java/lang/Throwable#getStackTraceDepth()I", async (thisObject) => {
            return thisObject["java/lang/Throwable:backtrace"].nativeArray.length;
        });
        rootClassLoader.defineNativeCode("java/lang/Throwable#getStackTraceElement(I)Ljava/lang/StackTraceElement;", async (thisObject, index) => {
            return thisObject["java/lang/Throwable:backtrace"].nativeArray[index];
        });
        rootClassLoader.defineNativeCode("java/security/AccessController#getStackAccessControlContext()Ljava/security/AccessControlContext;", async () => {
            return null;
        });
        rootClassLoader.defineNativeCode("java/lang/System#setOut0(Ljava/io/PrintStream;)V", async (out) => {
            let systemClass = await rootClassLoader.loadClass("java/lang/System");
            systemClass.staticTable["out"] = out;
        });
        rootClassLoader.defineNativeCode("java/lang/Throwable#fillInStackTrace(I)Ljava/lang/Throwable;", async (thisObject, dummy) => {
            if (thisObject != null) {
                thisObject["java/lang/Throwable:backtrace"] = await this.currentThread?.getStackTraceElementArray();
            }
            return thisObject;
        });
        rootClassLoader.defineNativeCode("sun/reflect/Reflection#getCallerClass()Ljava/lang/Class;", async () => {
            let currentThread = this.currentThread;
            let stack = currentThread.stack;
            if (stack.length < 4) {
                // return (await rootClassLoader.loadClass("java/lang/Object")).getClassObject();
                return null;
            }
            let item = stack[stack.length - 4];
            let declaringClass = item.declaringClass;
            return await declaringClass.getClassObject();
        });
        rootClassLoader.defineNativeCode("java/lang/Thread#registerNatives()V", async () => {
            rootClassLoader.defineNativeCode("java/lang/Thread#currentThread()Ljava/lang/Thread;", async () => {
                // throw new Error("The js jvm can't call currentThread");
                return this.currentThread;
            });
            rootClassLoader.defineNativeCode("java/lang/Thread#isAlive()Z", async (thisObject) => {
                return thisObject === this.currentThread.javaObject;
            });
            rootClassLoader.defineNativeCode("java/lang/Thread#start0()V", async (thisObject) => {
                let currentThread = this.currentThread;
                this.currentThread = new JavaThread(thisObject);
                thisObject["run()V"]();
                this.currentThread = currentThread;
            });
        });
        rootClassLoader.defineNativeCode("java/lang/Class#forName0(Ljava/lang/String;ZLjava/lang/ClassLoader;Ljava/lang/Class;)Ljava/lang/Class;", async (name, initialize, loader, caller) => {
            let n = await this.jsString(name);
            n = n.replaceAll(".", "/");
            try {
                /**
                 * @type {JavaClass}
                 */
                let c = await loader.nativeClassLoader.loadClass(n);
                if (initialize) {
                    await c.tryInit();
                }
                return c.getClassObject();
            } catch (e) {
                if (JavaContext.USE_JAVA_ERROR) {
                    let ex = await rootClassLoader.newInstanceWith("java/lang/ClassNotFoundException");
                    ex.jsError = e;
                    throw ex;
                } else {
                    throw e;
                }
            }
        });
        rootClassLoader.defineNativeCode("java/security/AccessController#doPrivileged(Ljava/security/PrivilegedAction;)Ljava/lang/Object;", async (action) => {
            return await action["run()Ljava/lang/Object;"]();
        });
        rootClassLoader.defineNativeCode("java/lang/Double#longBitsToDouble(J)D", async (value) => {
            let dataView = new DataView(new ArrayBuffer(8));
            dataView.setBigInt64(0, value);
            return dataView.getFloat64(0);
        });
        rootClassLoader.defineNativeCode("java/lang/Double#doubleToRawLongBits(D)J", async (value) => {
            let dataView = new DataView(new ArrayBuffer(8));
            dataView.setFloat64(0, value);
            return dataView.getBigInt64(0);
        });
        rootClassLoader.defineNativeCode("java/lang/Float#floatToRawIntBits(F)I", async (value) => {
            let dataView = new DataView(new ArrayBuffer(4));
            dataView.setFloat32(0, value);
            return dataView.getInt32(0);
        });
        rootClassLoader.defineNativeCode("java/lang/System#arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V", async (src, srcPos, dest, destPos, length) => {
            // todo check
            let srcArray = src.nativeArray;
            let destArray = dest.nativeArray;
            if (src === dest && destPos < srcPos) {
                for (let i = length - 1; i >= 0; i--) {
                    destArray[destPos + i] = srcArray[srcPos + i];
                }
            } else {
                for (let i = 0; i < length; i++) {
                    destArray[destPos + i] = srcArray[srcPos + i];
                }
            }
        });


        rootClassLoader.defineClass(new JavaDirectClass(rootClassLoader, "java/util/concurrent/atomic/AtomicInteger", await rootClassLoader.loadClass("java/lang/Number"), [
            new JavaField(null, 0, "value", "I"),
        ], [
            new JavaDirectMethod(0, "<init>", "()V", (object) => {

            }),
            new JavaDirectMethod(0, "<init>", "(I)V", (object, value) => {
                object["java/util/concurrent/atomic/AtomicInteger:value"] = value;
            }),
            new JavaDirectMethod(0, "get", "()I", (object) => {
                return object["java/util/concurrent/atomic/AtomicInteger:value"];
            }),
            new JavaDirectMethod(0, "getAndAdd", "(I)I", (object, value) => {
                let v = object["java/util/concurrent/atomic/AtomicInteger:value"];
                v += value;
                object["java/util/concurrent/atomic/AtomicInteger:value"] = v;
                return v;
            }),
        ]));

        rootClassLoader.defineClass(new JavaDirectClass(rootClassLoader, JavaContext.JS_CLASS_LOADER_NAME, await rootClassLoader.loadClass("java/lang/ClassLoader"), [], []));

        (await rootClassLoader.loadClass("java/lang/ref/Reference")).methodMap.delete("<clinit>()V");

        // 反射尚未完成
        // newInstance 被大量使用
        // 先 hack 实现此功能
        (await rootClassLoader.loadClass("java/lang/Class")).methodMap.get("newInstance()Ljava/lang/Object;").code.invoke = async (thisObject) => {
            let object = await thisObject.nativeClass.newInstance();
            await thisObject.nativeClass.invokeConstructor(object);
            return object;
        };

        let bitsClass = await rootClassLoader.loadClass("java/nio/Bits");
        bitsClass.methodMap.delete("<clinit>()V");
        await bitsClass.tryInit();
        let byteOrderClass = await rootClassLoader.loadClass("java/nio/ByteOrder");
        await byteOrderClass.tryInit();
        bitsClass.staticTable["byteOrder"] = byteOrderClass.staticTable["LITTLE_ENDIAN"];


        let threadClass = await rootClassLoader.loadClass("java/lang/Thread");
        let threadGroup = await rootClassLoader.newInstanceWith("java/lang/ThreadGroup");
        let mainThread = this.mainThread = this.currentThread = new JavaThread(await threadClass.newInstance());
        mainThread.javaObject["java/lang/Thread:group"] = threadGroup;
        mainThread.javaObject["java/lang/Thread:priority"] = 1;
        mainThread.javaObject["java/lang/Thread:name"] = await this.javaString("main");

        let properties = await rootClassLoader.newInstanceWith("java/util/Properties");
        await properties["setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;"](await this.javaString("file.encoding"), await this.javaString("UTF-16LE"));
        await properties["setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;"](await this.javaString("line.separator"), await this.javaString("\n"));
        await (await rootClassLoader.loadClass("java/lang/System")).methodMap.get("setProperties(Ljava/util/Properties;)V").invokeStatic(properties);

        this.currentThread = mainThread;
    }

    /**
     * @param {string} jsString
     * @return {Promise<JavaObject>}
     */
    async javaString(jsString) {
        if (jsString == null) {
            return null;
        }
        let charArray = await this.getPrimitiveClass("C").newArray(jsString.length);
        let nativeArray = charArray.nativeArray;
        for (let i = 0; i < jsString.length; i++) {
            nativeArray[i] = jsString.charCodeAt(i);
        }
        return await this.rootClassLoader.newInstanceWith("java/lang/String", "[C", charArray);
    }

    /**
     * @param {JavaObject} javaString
     * @return {Promise<string>}
     */
    async jsString(javaString) {
        if (javaString == null) {
            return null;
        }
        let nativeArray = javaString["java/lang/String:value"].nativeArray;
        return String.fromCharCode(...nativeArray);
    }

    /**
     * @param {JavaObject} throwable
     * @return {Promise<string>}
     */
    async errorLog(throwable) {
        if (throwable.javaClass != null) {
            let write = await this.rootClassLoader.newInstanceWith("java/io/StringWriter");
            let print = await this.rootClassLoader.newInstanceWith("java/io/PrintWriter", "Ljava/io/Writer;", write);
            await throwable["printStackTrace(Ljava/io/PrintWriter;)V"](print);
            return await this.jsString(await write["toString()Ljava/lang/String;"]());
        } else {
            return throwable?.name + throwable?.message + throwable?.stack;
        }
    }

}

export class JavaClassLoader {

    /**
     * @param {JavaClassLoader} parentClassLoader
     */
    constructor(parentClassLoader) {
        this.parentClassLoader = parentClassLoader;
        this.context = parentClassLoader?.context;
        this.nativeCodeMap = new Map();
    }

    /**
     *
     * @param {string} name
     * @param {string} [parameter]
     * @param {any} args
     * @return {Promise<JavaObject>}
     */
    async newInstanceWith(name, parameter, ...args) {
        let c = await this.loadClass(name);
        let n = await c.newInstance();
        await c.invokeConstructor(n, parameter, ...args);
        return n;
    }

    /**
     * @type {JavaContext}
     */
    context;

    /**
     * @type {JavaClassLoader}
     */
    parentClassLoader;

    /**
     * @return {Promise<JavaObject>}
     */
    async getClassLoaderObject() {
        let context = this.context;
        let currentThread = context.currentThread;
        if (this.classLoaderObject == null) {
            let jsClassLoaderClass = await this.loadClass(JavaContext.JS_CLASS_LOADER_NAME);
            context.currentThread = currentThread;
            let classLoaderObject = this.classLoaderObject = await jsClassLoaderClass.newInstance();
            classLoaderObject.nativeClassLoader = this;
            // todo
        }
        return this.classLoaderObject;
    }

    /**
     * @type {Map<string,function(...any):Promise<any>>}
     */
    nativeCodeMap;

    /**
     * @param {JavaMethod} method
     * @param {any} args
     * @return {Promise<any>}
     */
    async nativeCode(method, ...args) {
        let context = this.context;
        let currentThread = context.currentThread;
        currentThread?.push(method.defineClass, method, "js file", -2);
        if (JavaContext.DEBUG) {
            console.log("invoke native code ", method.name);
        }
        try {
            let name = `${method.defineClass.name}#${method.name}${method.descriptor}`;
            if (this.nativeCodeMap.has(name)) {
                return await this.nativeCodeMap.get(name)(...args);
            }
            if (JavaContext.USE_JAVA_ERROR) {
                throw await this.newInstanceWith("java/lang/UnsatisfiedLinkError", "Ljava/lang/String;", await context.javaString(name));
            } else {
                throw new Error("UnsatisfiedLinkError " + name);
            }
        } finally {
            currentThread?.pop();
            context.currentThread = currentThread;
            if (JavaContext.DEBUG) {
                console.log("exit native code ", method.name);
            }
        }
    }

    /**
     * @param {string} name
     * @param {function(...any):any} code
     */
    defineNativeCode(name, code) {
        if (this.nativeCodeMap.has(name)) {
            console.warn("has native code", name);
        } else {
            this.nativeCodeMap.set(name, code);
        }
    }

    /**
     * @param {string} name
     * @return {Promise<JavaClass>}
     */
    async findClass(name) {
        return null;
    }

    /**
     * @param {string} name
     * @return {Promise<JavaClass>}
     */
    async loadClass(name) {
        let context = this.context;
        let currentThread = context.currentThread;
        try {
            switch (name.charAt(0)) {
                case "Z":
                case "B":
                case "C":
                case "D":
                case "F":
                case "I":
                case "J":
                case "S":
                case "V":
                    return this.context.getPrimitiveClass(name);
                case "L": {
                    let index = name.indexOf(";");
                    console.assert(index === name.length - 1);
                    context.currentThread = currentThread;
                    return await this.loadClass(name.substring(1, index));
                }
                case "[": {
                    name = name.substring(1);
                    context.currentThread = currentThread;
                    return (await this.loadClass(name)).getArrayClass();
                }
                case "(": {
                    throw new Error();
                }
            }
            if (this.classMap.has(name)) {
                context.currentThread = currentThread;
                return this.classMap.get(name);
            }
            if (this.parentClassLoader != null) {
                context.currentThread = currentThread;
                return await this.parentClassLoader.loadClass(name);
            }
            context.currentThread = currentThread;
            await this.findClass(name);
            if (this.classMap.has(name)) {
                return this.classMap.get(name);
            }
            throw new Error(`Load class ${name} fail`);
        } finally {
            context.currentThread = currentThread;
        }
    }

    /**
     * @param {JavaClass} define
     * @return {JavaClass}
     */
    defineClass(define) {
        if (this.classMap.has(define.name)) {
            console.warn(`Redefine ${define.name}`);
        } else {
            this.classMap.set(define.name, define);
        }
        return this.classMap.get(define.name);
    }

    /**
     * @type {Map<string, JavaClass>}
     */
    classMap = new Map();
}

export class JavaClass {

    /**
     * @template {JavaObject} T
     * @param {T} object
     * @param {string} [parameter]
     * @param {any} args
     * @return {Promise<T>}
     */
    async invokeConstructor(object, parameter = "", ...args) {
        let context = this.classLoader.context;
        let currentThread = context.currentThread;
        await this.tryInit();
        context.currentThread = currentThread;
        await this.constructorTable[parameter].call(object, ...args);
        return object;
    }

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
     * @type {Set<JavaClass>}
     */
    superClassAndInterfaceSet;

    /**
     * @type {JavaClass}
     */
    containClass;

    /**
     * @type {JavaObject}
     */
    classObject;

    /**
     * @type {string}
     */
    sourceFile;

    /**
     * @return {Promise<JavaObject>}
     */
    async getClassObject() {
        if (this.classObject == null) {
            let classObject = await this.classLoader.newInstanceWith("java/lang/Class", "Ljava/lang/ClassLoader;", await this.classLoader.getClassLoaderObject());
            this.classObject = classObject;
            classObject.nativeClass = this;
            // todo
        }
        return this.classObject;
    }

    /**
     * @template {JavaObject} T
     * @param {T} object
     * @return {T}
     */
    checkCast(object) {
        if (object != null && !object.javaClass.superClassAndInterfaceSet.has(this)) {
            throw new Error();
        }
        return object;
    }

    /**
     * @param {JavaObject} object
     * @return {boolean}
     */
    instanceOf(object) {
        return object == null || object.javaClass.superClassAndInterfaceSet.has(this);
    }

    /**
     * @type {number}
     */
    accessFlags;

    /**
     * @type {string}
     */
    name;

    /**
     * @type {string}
     */
    primitiveName;

    /**
     * @type {Map<string, JavaField>}
     */
    fieldMap;

    /**
     * @type {Map<string, JavaMethod>}
     */
    methodMap;

    /**
     * @type {JavaObject}
     */
    virtualTable;

    /**
     * @type {any}
     */
    constructorTable;

    /**
     * @type {any}
     */
    staticTable;

    /**
     * @type {JavaClass}
     */
    arrayClass;

    /**
     * @return {JavaClass}
     */
    getArrayClass() {
        if (this.arrayClass == null) {
            this.arrayClass = new JavaArrayClass(this);
        }
        return this.arrayClass;
    }

    /**
     * @type {boolean}
     */
    hasInit = false;

    /**
     * @return {Promise<void>}
     */
    async tryInit() {
        if (this.hasInit) {
            return;
        }
        this.hasInit = true;
        await this.init();
    }

    /**
     * @return {Promise<void>}
     */
    async init() {
        let context = this.classLoader.context;
        let currentThread = context.currentThread;
        let superClassAndInterface = this.superClassAndInterfaceSet = new Set();
        superClassAndInterface.add(this);
        let superClassRef = await this.getSuperClass();
        context.currentThread = currentThread;
        if (superClassRef != null) {
            await superClassRef.tryInit();
            superClassAndInterface.add(superClassRef);
            for (let si of superClassRef.superClassAndInterfaceSet) {
                superClassAndInterface.add(si);
            }
        }
        let superVirtualTable = superClassRef?.virtualTable;
        let virtualTable;
        if (superVirtualTable != null) {
            virtualTable = this.virtualTable = Object.create(superClassRef.virtualTable);
        } else {
            virtualTable = this.virtualTable = /** @type {JavaObject} */{};
        }
        let constructorTable = this.constructorTable = {};
        virtualTable.javaClass = this;
        for (let method of this.methodMap.values()) {
            if (method.name === "<init>") {
                constructorTable[method.descriptorParameter] = async function (...args) {
                    return await method.invokeSpecial(this, ...args);
                };
                continue;
            }
            if ((method.accessFlags & JavaAccessFlags.STATIC) === 0) {
                virtualTable[`${method.name}${method.descriptor}`] = async function (...args) {
                    return await method.invokeSpecial(this, ...args);
                };
                // continue;
            }
            // todo
        }
        let staticTable = this.staticTable = {};
        for (let f of this.fieldMap.values()) {
            if ((f.accessFlags & JavaAccessFlags.STATIC) === 0) {
                continue;
            }
            let value;
            switch (f.descriptor) {
                case "Z":
                    value = false;
                    break;
                case "B":
                case "C":
                case "F":
                case "I":
                case "S":
                    value = 0;
                    break;
                case "D":
                case "J":
                    value = BigInt("0");
                    break;
                case "V":
                    throw new Error();
                default:
                    value = null;
            }
            context.currentThread = currentThread;
            if (f.constantValue != null) {
                switch (f.constantValue.tag) {
                    case JavaConstantLong.TAG:
                        value = f.constantValue.castLong().long;
                        break;
                    case JavaConstantDouble.TAG:
                        value = f.constantValue.castDouble().double;
                        break;
                    case JavaConstantInteger.TAG:
                        value = f.constantValue.castInteger().integer;
                        break;
                    case JavaConstantFloat.TAG:
                        value = f.constantValue.castFloat().float;
                        break;
                    case JavaConstantClass.TAG:
                        value = await f.constantValue.castClass().getClassRef();
                        break;
                    case JavaConstantString.TAG:
                        value = await f.constantValue.castString().getStringRef();
                        break;
                    default:
                        throw new Error();
                }
            }
            staticTable[f.name] = value;
        }

        context.currentThread = currentThread;
        await this.methodMap.get("<clinit>()V")?.invokeStatic();
        context.currentThread = currentThread;
    }

    /**
     * @return {Promise<JavaObject>}
     */
    async newInstance() {
        await this.tryInit();
        let object = Object.create(this.virtualTable);
        for (let c = this; c != null; c = await c.getSuperClass()) {
            for (let f of c.fieldMap.values()) {
                if ((f.accessFlags & JavaAccessFlags.STATIC) !== 0) {
                    continue;
                }
                let value;
                switch (f.descriptor) {
                    case "Z":
                        value = false;
                        break;
                    case "B":
                    case "C":
                    case "F":
                    case "I":
                    case "S":
                        value = 0;
                        break;
                    case "D":
                    case "J":
                        value = BigInt("0");
                        break;
                    case "V":
                        throw new Error();
                    default:
                        value = null;
                }
                // todo init value read
                object[`${c.name}:${f.name}`] = value;
            }
        }
        return object;
    }

    /**
     * @param {number} length
     * @return {Promise<JavaObject>}
     */
    async newInstanceAsArray(length) {
        throw new Error();
    }

    /**
     * 创建一个以此类为类型的多维数组.
     *
     * @param {number} lengths
     * @return {Promise<JavaObject>}
     */
    async newArray(...lengths) {
        let context = this.classLoader.context;
        let currentThread = context.currentThread;
        let dim = lengths.length;
        if (dim === 0) {
            throw new Error();
        }
        let thisLength = lengths.shift();
        let subLengths = lengths;
        let arrayClass = this;
        for (let i = 0; i < dim; i++) {
            arrayClass = arrayClass.getArrayClass();
        }
        context.currentThread = currentThread;
        let array = await arrayClass.newInstanceAsArray(thisLength);
        if (dim > 1) {
            let nativeArray = array.nativeArray;
            for (let i = 0; i < thisLength; i++) {
                context.currentThread = currentThread;
                nativeArray[i] = await this.newArray(...subLengths);
            }
        }
        context.currentThread = currentThread;
        return array;
    }

    /**
     * @return {Promise<JavaClass>}
     */
    async getSuperClass() {
        throw new Error();
    }

}

export class JavaPrimitiveClass extends JavaClass {
    /**
     * @param {JavaClassLoader} classLoader
     * @param {string} baseName
     */
    constructor(classLoader, baseName) {
        super(classLoader);
        this.name = baseName;
        this.primitiveName = baseName;
    }

    /**
     * @return {Promise<JavaClass>}
     */
    async getSuperClass() {
        return null;
    }
}

export class JavaArrayClass extends JavaClass {
    /**
     * @param {JavaClass} containClass
     */
    constructor(containClass) {
        super(containClass.classLoader);
        this.containClass = containClass;
        if (containClass.primitiveName != null) {
            this.name = "[" + containClass.primitiveName;
        } else {
            this.name = "[L" + containClass.name + ";";
        }
        let fieldMap = this.fieldMap = new Map();
        let methodMap = this.methodMap = new Map();
        let cloneMethod = new JavaDirectMethod(0, "clone", "()Ljava/lang/Object;" + this.name, async (thisObject) => {
            let newArray = await this.newInstanceAsArray(thisObject.nativeArray.length);
            for (let i = 0; i < thisObject.nativeArray.length; i++) {
                newArray.nativeArray[i] = thisObject.nativeArray[i];
            }
            return newArray;
        });
        cloneMethod.defineClass = this;
        methodMap.set("clone()Ljava/lang/Object;", cloneMethod);
    }

    /**
     * @param {number} length
     * @return {Promise<JavaObject>}
     */
    async newInstanceAsArray(length) {
        await this.tryInit();
        let array = Object.create(this.virtualTable);
        switch (this.containClass.primitiveName) {
            case "B":
                array.nativeArray = new Int8Array(length);
                break;
            case "C":
                array.nativeArray = new Uint16Array(length);
                break;
            case "S":
                array.nativeArray = new Int16Array(length);
                break;
            case "D":
                array.nativeArray = new Float64Array(length);
                break;
            case "J":
                array.nativeArray = new BigInt64Array(length);
                break;
            case "I":
                array.nativeArray = new Int32Array(length);
                break;
            default:
                array.nativeArray = new Array(length);
        }
        return array;
    }

    /**
     * @return {Promise<JavaClass>}
     */
    async getSuperClass() {
        if (this.containClass.primitiveName != null) {
            return await this.classLoader.loadClass("java/lang/Object");
        } else {
            return (await this.containClass.getSuperClass())?.getArrayClass();
        }
    }
}

export class JavaField {

    /**
     * @param {JavaClass} [c]
     * @param {number} [accessFlags]
     * @param {string} [name]
     * @param {string} [descriptor]
     */
    constructor(c, accessFlags, name, descriptor) {
        this.defineClass = c;
        this.accessFlags = accessFlags;
        this.name = name;
        this.descriptor = descriptor;
        if (descriptor != null) {
            this.type = new JavaType(this.descriptor);
        }
    }

    /**
     * @type {JavaClass}
     */
    defineClass;

    /**
     * @type {number}
     */
    accessFlags;

    /**
     * @type {string}
     */
    name;

    /**
     * @type {string}
     */
    descriptor;

    /**
     * @type {JavaType}
     */
    type;

    /**
     * @param {any} value
     * @return {Promise<void>}
     */
    async pusStatic(value) {
        await this.defineClass.tryInit();
        this.defineClass.staticTable[this.name] = value;
    }

    /**
     * @return {Promise<any>}
     */
    async getStatic() {
        await this.defineClass.tryInit();
        return this.defineClass.staticTable[this.name];
    }

    /**
     * @param {JavaObject} object
     * @param {any} value
     * @return {Promise<void>}
     */
    async putField(object, value) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        try {
            await this.defineClass.tryInit();
            context.currentThread = currentThread;
            if (object == null) {
                if (JavaContext.USE_JAVA_ERROR) {
                    throw await context.rootClassLoader.newInstanceWith("java/lang/NullPointerException");
                } else {
                    throw new Error("NullPointerException");
                }
            }
            object[`${this.defineClass.name}:${this.name}`] = value;
        } finally {
            context.currentThread = currentThread;
        }
    }

    /**
     * @param {JavaObject} object
     * @return {Promise<any>}
     */
    async getField(object) {
        await this.defineClass.tryInit();
        if (object == null) {
            throw new Error(`Nullptr`);
        }
        return object[`${this.defineClass.name}:${this.name}`];
    }
}

export class JavaMethod {
    /**
     * @param {JavaClass} [c]
     * @param {number} [accessFlags]
     * @param {string} [name]
     * @param {string} [descriptor]
     */
    constructor(c, accessFlags, name, descriptor) {
        this.defineClass = c;
        this.accessFlags = accessFlags;
        this.name = name;
        this.descriptor = descriptor;
        if (descriptor != null) {
            this.type = new JavaType(this.descriptor);
            this.descriptorParameter = this.type.parameterToString();
        }
    }

    /**
     * @type {JavaClass}
     */
    defineClass;

    /**
     * @type {number}
     */
    accessFlags;

    /**
     * @type {string}
     */
    name;

    /**
     * @type {string}
     */
    descriptor;

    /**
     * @type {string}
     */
    descriptorParameter;

    /**
     * @type {JavaType}
     */
    type;

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invokeVirtual(...args) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        try {
            await this.defineClass.tryInit();
            context.currentThread = currentThread;
            let thisObject = args.shift();
            let callArgs = args;
            if (thisObject == null) {
                if (JavaContext.USE_JAVA_ERROR) {
                    throw await context.rootClassLoader.newInstanceWith("java/lang/NullPointerException");
                } else {
                    throw new Error("NullPointerException");
                }
            }
            let method = thisObject[`${this.name}${this.descriptor}`];
            if (method != null) {
                return await thisObject[`${this.name}${this.descriptor}`](...callArgs);
            }
            method = thisObject[this.name];
            if (method != null) {
                return await thisObject[this.name](...callArgs);
            }
            throw new Error();
        } finally {
            context.currentThread = currentThread;
        }
    }

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invokeSpecial(...args) {
        throw new Error();
    }

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invokeStatic(...args) {
        throw new Error();
    }

}

export class JavaDirectClass extends JavaClass {

    /**
     * @param {JavaClassLoader} classLoader
     * @param {string} name
     * @param {JavaClass} superClass
     * @param {JavaField[]} fields
     * @param {JavaMethod[]} methods
     */
    constructor(classLoader, name, superClass, fields, methods) {
        super(classLoader);
        this.name = name;
        let fieldMap = this.fieldMap = new Map();
        for (let i = 0; i < fields.length; i++) {
            let field = fields[i];
            if (fieldMap.has(field.name + ":" + field.descriptor)) {
                throw new Error();
            }
            field.defineClass = this;
            fieldMap.set(field.name + ":" + field.descriptor, field);
        }
        let methodMap = this.methodMap = new Map();
        for (let i = 0; i < methods.length; i++) {
            let method = methods[i];
            if (methodMap.has(method.name + method.descriptor)) {
                throw new Error();
            }
            method.defineClass = this;
            methodMap.set(method.name + method.descriptor, method);
        }
        this.superClass = superClass;
    }

    /**
     * @type {JavaClass}
     */
    superClass;

    /**
     * @return {Promise<JavaClass>}
     */
    async getSuperClass() {
        return this.superClass;
    }

}

export class JavaDirectMethod extends JavaMethod {

    /**
     * @param {number} accessFlags
     * @param {string} name
     * @param {string} descriptor
     * @param {function(...any):any} code
     */
    constructor(accessFlags, name, descriptor, code) {
        super(null, accessFlags, name, descriptor);
        this.code = code;
    }

    /**
     * @type {function(...any):any}
     */
    code;

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invokeSpecial(...args) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        try {
            return await this.code(...args);
        } finally {
            context.currentThread = currentThread;
        }
    }

    /**
     * @param {any} args
     * @return {Promise<any>}
     */
    async invokeStatic(...args) {
        let context = this.defineClass.classLoader.context;
        let currentThread = context.currentThread;
        try {
            return await this.code(...args);
        } finally {
            context.currentThread = currentThread;
        }
    }

}
