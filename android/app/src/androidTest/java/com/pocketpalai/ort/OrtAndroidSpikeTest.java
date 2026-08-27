package com.pocketpalai.ort;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.microsoft.onnxruntime.OnnxTensor;
import com.microsoft.onnxruntime.OrtEnvironment;
import com.microsoft.onnxruntime.OrtSession;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.FloatBuffer;
import java.nio.file.Files;
import java.util.Map;
import java.util.Set;

@RunWith(AndroidJUnit4.class)
public final class OrtAndroidSpikeTest {
    private static final String TAG = "OrtAndroidSpike";
    private static final String MODEL_NAME = "ort-spike-identity.onnx";

    @Test
    public void cpuInferenceAndProviderDiscoverySucceed() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File modelFile = new File(context.getFilesDir(), MODEL_NAME);
        long startNanos = System.nanoTime();
        writeBytes(modelFile, tinyIdentityModel());

        OrtEnvironment environment = OrtEnvironment.getEnvironment();
        Set<?> providers = OrtEnvironment.getAvailableProviders();
        assertNotNull(providers);
        String providerSummary = providers.toString();

        boolean xnnpackAvailable = providerSummary.toUpperCase().contains("XNNPACK");
        boolean nnapiAvailable = providerSummary.toUpperCase().contains("NNAPI");
        float[] actual;
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions();
             OrtSession session = environment.createSession(modelFile.getAbsolutePath(), options);
             OnnxTensor input = OnnxTensor.createTensor(environment, FloatBuffer.wrap(new float[]{3.5f}), new long[]{1});
             OrtSession.Result result = session.run(Map.of("X", input))) {
            Object value = result.get(0).getValue();
            actual = value instanceof float[] ? (float[]) value : ((float[][]) value)[0];
        }
        assertArrayEquals(new float[]{3.5f}, actual, 0.00001f);
        long elapsedMillis = (System.nanoTime() - startNanos) / 1_000_000L;

        String report = "ORT Android spike\n"
                + "runtime=onnxruntime-android 1.24.3\n"
                + "abi=" + BuildInfo.abi() + "\n"
                + "providers=" + providerSummary + "\n"
                + "xnnpackAvailable=" + xnnpackAvailable + "\n"
                + "nnapiAvailable=" + nnapiAvailable + "\n"
                + "cpuFallback=verified\n"
                + "modelBytes=" + modelFile.length() + "\n"
                + "startupAndInferenceMillis=" + elapsedMillis + "\n";
        File reportFile = new File(context.getFilesDir(), "ort-spike-report.txt");
        Files.writeString(reportFile.toPath(), report);
        Log.i(TAG, report.replace('\n', ' '));
        assertEquals(3.5f, actual[0], 0.00001f);
    }

    private static void writeBytes(File file, byte[] bytes) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
    }

    // Minimal ONNX ModelProto: X -> Identity -> Y, shape [1], float32.
    // It is generated in app-private storage so no model binary is committed.
    private static byte[] tinyIdentityModel() throws Exception {
        byte[] dim = message(fieldVarint(1, 1));
        byte[] shape = message(fieldBytes(1, dim));
        byte[] tensorType = message(fieldVarint(1, 1), fieldBytes(2, shape));
        byte[] type = message(fieldBytes(1, tensorType));
        byte[] input = message(fieldString(1, "X"), fieldBytes(2, type));
        byte[] output = message(fieldString(1, "Y"), fieldBytes(2, type));
        byte[] node = message(fieldString(1, "X"), fieldString(2, "Y"), fieldString(4, "Identity"));
        byte[] opset = message(fieldVarint(2, 13));
        byte[] graph = message(fieldBytes(1, node), fieldString(2, "ort_android_spike"), fieldBytes(3, input), fieldBytes(4, output));
        return message(fieldVarint(1, 7), fieldBytes(7, graph), fieldBytes(8, opset));
    }

    private static byte[] message(byte[]... fields) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] field : fields) out.write(field);
        return out.toByteArray();
    }

    private static byte[] fieldString(int number, String value) throws Exception { return fieldBytes(number, value.getBytes("UTF-8")); }
    private static byte[] fieldBytes(int number, byte[] value) throws Exception {
        return concat(varint((number << 3) | 2), varint(value.length), value);
    }
    private static byte[] fieldVarint(int number, long value) throws Exception { return concat(varint(number << 3), varint(value)); }
    private static byte[] varint(long value) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        while ((value & ~0x7fL) != 0) { out.write((int) ((value & 0x7f) | 0x80)); value >>>= 7; }
        out.write((int) value); return out.toByteArray();
    }
    private static byte[] concat(byte[]... parts) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) out.write(part);
        return out.toByteArray();
    }

    private static final class BuildInfo {
        static String abi() { return android.os.Build.SUPPORTED_ABIS[0]; }
    }
}
