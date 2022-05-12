import {JavaContext} from "../../javaContext.js";
import {JavaJarClassSource} from "../../javaJarClassSource.js";
import {JavaFetchClassSource, JavaSourceClassLoader} from "../../javaFileClassLoader.js";

let context = new JavaContext();

let urlBase;
let testLocalRt = await fetch("../../rt/META-INF/MANIFEST.MF");
if (!testLocalRt.ok) {
    urlBase = "https://823984418.github.io/java_runtime/jdk8u231/";
} else {
    urlBase = "../../rt/";
}

let jarFile = await new JSZip().loadAsync(await (await fetch("../../min_rt.jar")).arrayBuffer());

let classLoader = new JavaSourceClassLoader(null, [
    new JavaJarClassSource(jarFile),
    new JavaFetchClassSource(urlBase),
]);

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
