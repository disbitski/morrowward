import Foundation
import WebKit

struct MorrowwardBackupPayload {
    static let maximumByteCount = 1 * 1_024 * 1_024

    let data: Data
    let filename: String

    init?(messageBody: Any) {
        guard let body = messageBody as? [String: Any],
              let encodedData = body["base64"] as? String,
              let data = Data(base64Encoded: encodedData),
              !data.isEmpty,
              data.count <= Self.maximumByteCount else {
            return nil
        }

        self.data = data
        self.filename = Self.safeFilename(body["filename"] as? String)
    }

    private static func safeFilename(_ candidate: String?) -> String {
        let fallback = "morrowward-backup.json"
        guard let candidate else { return fallback }

        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        let sanitizedScalars = candidate.unicodeScalars.filter { allowed.contains($0) }
        let sanitized = String(String.UnicodeScalarView(sanitizedScalars))
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
            .prefix(96)
        guard !sanitized.isEmpty else { return fallback }

        let filename = String(sanitized)
        return filename.lowercased().hasSuffix(".json") ? filename : "\(filename).json"
    }
}

@MainActor
final class MorrowwardBackupBridge: NSObject, WKScriptMessageHandler {
    static let messageName = "morrowwardBackup"

    var onBackup: ((MorrowwardBackupPayload) -> Void)?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == Self.messageName,
              let payload = MorrowwardBackupPayload(messageBody: message.body) else {
            return
        }
        onBackup?(payload)
    }

    static var exportUserScript: WKUserScript {
        WKUserScript(
            source: #"""
            (() => {
              if (window.__morrowwardNativeBackupBridgeInstalled) return;
              window.__morrowwardNativeBackupBridgeInstalled = true;

              document.addEventListener("click", (event) => {
                const path = typeof event.composedPath === "function" ? event.composedPath() : [];
                const anchor = path.find((node) => node instanceof HTMLAnchorElement);
                if (!anchor || !anchor.hasAttribute("download") || !anchor.href.startsWith("blob:")) return;

                const bridge = window.webkit?.messageHandlers?.morrowwardBackup;
                if (!bridge) return;

                event.preventDefault();
                event.stopImmediatePropagation();

                void (async () => {
                  const response = await fetch(anchor.href);
                  const buffer = await response.arrayBuffer();
                  if (buffer.byteLength > 1_048_576) return;
                  const bytes = new Uint8Array(buffer);
                  const chunkSize = 0x8000;
                  let binary = "";
                  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
                  }
                  bridge.postMessage({
                    filename: anchor.download || "morrowward-backup.json",
                    base64: btoa(binary)
                  });
                })().catch(() => {});
              }, true);
            })();
            """#,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }
}
