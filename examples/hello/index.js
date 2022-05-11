import {JavaContext} from "../../javaContext.js";
import {FetchJavaClassLoader} from "../../javaFileContext.js";

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
