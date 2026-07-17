import Foundation

struct MorrowwardOriginPolicy: Sendable {
    private struct Origin: Equatable, Sendable {
        let scheme: String
        let host: String
        let port: Int
    }

    let originURL: URL
    private let origin: Origin

    init?(origin: URL) {
        guard let components = URLComponents(url: origin, resolvingAgainstBaseURL: false),
              let canonicalOrigin = Self.canonicalOrigin(for: components),
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              components.path.isEmpty || components.path == "/" else {
            return nil
        }

        self.originURL = origin
        self.origin = canonicalOrigin
    }

    func contains(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let candidate = Self.canonicalOrigin(for: components) else {
            return false
        }
        return candidate == origin
    }

    func containsTrustedBlob(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "blob" else {
            return false
        }

        let rawValue = url.absoluteString
        guard rawValue.hasPrefix("blob:"),
              let embeddedURL = URL(string: String(rawValue.dropFirst("blob:".count))) else {
            return false
        }
        return contains(embeddedURL)
    }

    private static func canonicalOrigin(for components: URLComponents) -> Origin? {
        guard let rawScheme = components.scheme?.lowercased(),
              rawScheme == "https" || rawScheme == "http",
              let rawHost = components.host?.lowercased(),
              !rawHost.isEmpty else {
            return nil
        }

        let defaultPort = rawScheme == "https" ? 443 : 80
        return Origin(scheme: rawScheme, host: rawHost, port: components.port ?? defaultPort)
    }
}
