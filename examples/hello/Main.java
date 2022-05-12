import java.io.*;
import java.util.Properties;

public class Main extends OutputStream {

    static native void innerTextAppend(String c);

    @Override
    public void write(int b) throws IOException {
        this.write(new byte[]{(byte) b});
    }

    @Override
    public void write(byte[] b, int off, int len) throws IOException {
        if (b == null) {
            throw new NullPointerException();
        } else if ((off < 0) || (off > b.length) || (len < 0) ||
                ((off + len) > b.length) || ((off + len) < 0)) {
            throw new IndexOutOfBoundsException();
        } else if (len == 0) {
            return;
        }
        innerTextAppend(new String(b, off, len));
    }

    static double sumTo(int a) {
        double sum = 0;
        for (int i = 0; i <= a; i++) {
            sum += Math.sin(i);
        }
        return sum;
    }

    public static void main(String[] args) throws Exception {
        try {
            System.setOut(new PrintStream(new BufferedOutputStream(new Main()), true));
            System.out.println("Hello " + "world? " + 114514);
            System.out.println("你好");
            int n = 100000;
            System.out.println("sin(1) + sin(2) + ... + sin(" + n + ") = " + sumTo(n));
            StringWriter writer = new StringWriter();
            new Exception().printStackTrace(new PrintWriter(writer));
            System.out.println(writer.getBuffer());
            System.out.println(Class.forName("java.lang.Object"));
        } finally {
            System.out.flush();
        }
    }
}
