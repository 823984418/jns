import {JavaContext} from "../../javaContext.js";
import {FetchJavaClassLoader} from "../../javaFileClassLoader.js";

let context = new JavaContext();
let classLoader = new FetchJavaClassLoader(null);

let testLocalRt = await fetch("../../rt/META-INF/MANIFEST.MF");
if (!testLocalRt.ok) {
    classLoader.urlBase = "https://823984418.github.io/java_runtime/jdk8u231/";
    document.body.innerText += "没有找到位于项目中的运行时类库\n";
    document.body.innerText += "使用的运行时类库部署在 github Page 上，第一次访问较慢，请耐心等待\n";
} else {
    classLoader.urlBase = "../../rt/";
}

// 同步获取一次可能要获取的类资源以促进降低首次加载时间
await Promise.all([
    "java/io/BufferedOutputStream",
    "java/io/BufferedWriter",
    "java/io/Closeable",
    "java/io/FilterOutputStream",
    "java/io/Flushable",
    "java/io/ObjectStreamField",
    "java/io/OutputStream",
    "java/io/OutputStreamWriter",
    "java/io/PrintStream",
    "java/io/PrintWriter",
    "java/io/Serializable",
    "java/io/StringWriter",
    "java/io/Writer",
    "java/lang/AbstractStringBuilder",
    "java/lang/Appendable",
    "java/lang/Boolean",
    "java/lang/Byte",
    "java/lang/CharSequence",
    "java/lang/Character",
    "java/lang/Class",
    "java/lang/ClassLoader",
    "java/lang/Cloneable",
    "java/lang/Comparable",
    "java/lang/Double",
    "java/lang/Exception",
    "java/lang/Float",
    "java/lang/Integer",
    "java/lang/Long",
    "java/lang/Math",
    "java/lang/Number",
    "java/lang/Object",
    "java/lang/Readable",
    "java/lang/Runnable",
    "java/lang/RuntimePermission",
    "java/lang/Short",
    "java/lang/StackTraceElement",
    "java/lang/String",
    "java/lang/String$CaseInsensitiveComparator",
    "java/lang/StringBuffer",
    "java/lang/StringBuilder",
    "java/lang/StringCoding",
    "java/lang/StringCoding$StringDecoder",
    "java/lang/System",
    "java/lang/Thread",
    "java/lang/Thread$UncaughtExceptionHandler",
    "java/lang/ThreadGroup",
    "java/lang/ThreadLocal",
    "java/lang/ThreadLocal$ThreadLocalMap",
    "java/lang/ThreadLocal$ThreadLocalMap$Entry",
    "java/lang/Throwable",
    "java/lang/Throwable$PrintStreamOrWriter",
    "java/lang/Throwable$WrappedPrintWriter",
    "java/lang/ref/Reference",
    "java/lang/ref/ReferenceQueue",
    "java/lang/ref/ReferenceQueue$Lock",
    "java/lang/ref/ReferenceQueue$Null",
    "java/lang/ref/SoftReference",
    "java/lang/ref/WeakReference",
    "java/lang/reflect/AnnotatedElement",
    "java/lang/reflect/GenericDeclaration",
    "java/lang/reflect/Type",
    "java/nio/Bits",
    "java/nio/Buffer",
    "java/nio/ByteBuffer",
    "java/nio/ByteOrder",
    "java/nio/CharBuffer",
    "java/nio/HeapByteBuffer",
    "java/nio/HeapCharBuffer",
    "java/nio/charset/Charset",
    "java/nio/charset/CharsetDecoder",
    "java/nio/charset/CharsetEncoder",
    "java/nio/charset/CoderResult",
    "java/nio/charset/CoderResult$1",
    "java/nio/charset/CoderResult$2",
    "java/nio/charset/CoderResult$Cache",
    "java/nio/charset/CodingErrorAction",
    "java/nio/charset/spi/CharsetProvider",
    "java/security/AccessController",
    "java/security/BasicPermission",
    "java/security/Guard",
    "java/security/Permission",
    "java/security/PrivilegedAction",
    "java/security/cert/Certificate",
    "java/util/AbstractCollection",
    "java/util/AbstractList",
    "java/util/AbstractMap",
    "java/util/AbstractSet",
    "java/util/ArrayList",
    "java/util/Arrays",
    "java/util/Collection",
    "java/util/Collections",
    "java/util/Collections$EmptyList",
    "java/util/Collections$EmptyMap",
    "java/util/Collections$EmptySet",
    "java/util/Collections$SetFromMap",
    "java/util/Collections$UnmodifiableCollection",
    "java/util/Collections$UnmodifiableList",
    "java/util/Collections$UnmodifiableRandomAccessList",
    "java/util/Comparator",
    "java/util/Dictionary",
    "java/util/HashMap",
    "java/util/HashMap$Node",
    "java/util/Hashtable",
    "java/util/Hashtable$Entry",
    "java/util/IdentityHashMap",
    "java/util/IdentityHashMap$KeySet",
    "java/util/List",
    "java/util/Map",
    "java/util/Map$Entry",
    "java/util/Objects",
    "java/util/Properties",
    "java/util/RandomAccess",
    "java/util/Set",
    "java/util/Stack",
    "java/util/Vector",
    "java/util/concurrent/atomic/AtomicInteger",
    "sun/misc/VM",
    "sun/nio/cs/ArrayDecoder",
    "sun/nio/cs/FastCharsetProvider",
    "sun/nio/cs/HistoricallyNamedCharset",
    "sun/nio/cs/StandardCharsets",
    "sun/nio/cs/StandardCharsets$Aliases",
    "sun/nio/cs/StandardCharsets$Cache",
    "sun/nio/cs/StandardCharsets$Classes",
    "sun/nio/cs/StreamEncoder",
    "sun/nio/cs/Surrogate",
    "sun/nio/cs/Surrogate$Parser",
    "sun/nio/cs/UTF_16LE",
    "sun/nio/cs/UTF_16LE$Decoder",
    "sun/nio/cs/UTF_16LE$Encoder",
    "sun/nio/cs/Unicode",
    "sun/nio/cs/UnicodeDecoder",
    "sun/nio/cs/UnicodeEncoder",
    "sun/reflect/Reflection",
    "sun/security/action/GetPropertyAction",
    "sun/util/PreHashedMap"
].map(i => fetch(classLoader.urlBase + i + ".class")));

context.setRootClassLoader(classLoader);
// JavaContext.DEBUG = true;
await context.init();

classLoader.defineNativeCode("Main#innerTextAppend(Ljava/lang/String;)V", async (string) => {
    document.body.innerText += await context.jsString(string);
});

window.context = context;
console.log(context);

async function main() {
    classLoader.defineClassFile(new DataView(await (await fetch("Main.class")).arrayBuffer()));
    let main = await classLoader.loadClass("Main");
    await main.methodMap.get("main([Ljava/lang/String;)V").invokeStatic(null);
}

try {
    await main();
} catch (e) {
    let error = await context.errorLog(e);
    document.body.innerText += error + "\n";
}
