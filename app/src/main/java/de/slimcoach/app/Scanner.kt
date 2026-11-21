package de.slimcoach.app

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

@Composable
fun ScannerScreen(onCode: (String) -> Unit) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var submitted by remember { mutableStateOf(false) }
    var upce by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf("") }
    val fields = Fields("Barcode" to "")
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = it
        if (!it) error = "Kamerazugriff fehlt. Du kannst den Barcode eingeben oder den Zugriff in Android erlauben."
    }
    val submit: (String) -> Unit = { code ->
        if (!submitted) {
            submitted = true
            onCode(code)
        }
    }
    Page {
        if (granted && !submitted) CameraPreview(submit)
        else if (!granted) {
            Text("Erlaube die Kamera, um den Code auf der Verpackung zu scannen.")
            Button(onClick = { permission.launch(Manifest.permission.CAMERA) }) { Text("Kamera öffnen") }
        }
        Text("Barcode manuell eingeben", style = MaterialTheme.typography.titleMedium)
        Field(fields, "Barcode", true)
        Toggle("Der Code ist UPC-E", upce) { upce = it }
        ErrorText(error)
        OutlinedButton(onClick = {
            val normalized = BarcodeCode.normalize(fields["Barcode"].orEmpty(), upce)
            if (normalized == null) error = "Der Barcode ist ungültig. Prüfe die Ziffern und das Format."
            else submit(normalized)
        }, enabled = !submitted) { Text("Produkt nachschlagen") }
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onCode: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val callback by rememberUpdatedState(onCode)
    val previewView = remember { PreviewView(context).apply {
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    } }
    var status by remember { mutableStateOf("Kamera wird geöffnet …") }
    Box(Modifier.fillMaxWidth().height(260.dp), contentAlignment = Alignment.Center) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxWidth(.8f).height(110.dp)
            .border(2.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(12.dp)))
    }
    Text(status)
    DisposableEffect(context, lifecycle, previewView) {
        val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
            Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E
        ).build())
        val executor = ContextCompat.getMainExecutor(context)
        val future = ProcessCameraProvider.getInstance(context)
        val preview = Preview.Builder().build().apply { surfaceProvider = previewView.surfaceProvider }
        val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        var disposed = false
        var accepted = false
        var provider: ProcessCameraProvider? = null
        analysis.setAnalyzer(executor) { frame ->
            val image = frame.image
            if (image == null || disposed || accepted) frame.close()
            else {
                scanner.process(InputImage.fromMediaImage(image, frame.imageInfo.rotationDegrees))
                    .addOnSuccessListener(executor) { codes ->
                        if (!disposed && !accepted) {
                            val code = codes.firstNotNullOfOrNull {
                                it.rawValue?.let { value -> BarcodeCode.normalize(value, it.format == Barcode.FORMAT_UPC_E) }
                            }
                            if (code != null) {
                                accepted = true
                                callback(code)
                            }
                        }
                    }
                    .addOnFailureListener(executor) {
                        if (!disposed) status = "Erkennung fehlgeschlagen. Richte die Kamera neu aus oder gib den Code ein."
                    }
                    .addOnCompleteListener(executor) { frame.close() }
            }
        }
        future.addListener({
            if (!disposed) {
                try {
                    val camera = future.get()
                    provider = camera
                    camera.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    status = "Halte den Barcode in den markierten Bereich."
                } catch (_: Exception) {
                    status = "Die Rückkamera ist nicht verfügbar. Gib den Barcode manuell ein."
                }
            }
        }, executor)
        onDispose {
            disposed = true
            analysis.clearAnalyzer()
            provider?.unbind(preview, analysis)
            scanner.close()
        }
    }
}
