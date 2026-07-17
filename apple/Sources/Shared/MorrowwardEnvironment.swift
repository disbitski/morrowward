import Foundation

enum MorrowwardEnvironment {
    static let productionOrigin = URL(string: "https://morrowward.vercel.app")!

    static var resolvedOrigin: URL {
        let configuredOrigin = Bundle.main.object(forInfoDictionaryKey: "MorrowwardReleaseOrigin") as? String
        let releaseOrigin = validatedOrigin(configuredOrigin) ?? productionOrigin

        #if DEBUG
        if let override = debugOverride,
           let localOrigin = validatedDebugOrigin(override) {
            return localOrigin
        }
        #endif

        return releaseOrigin
    }

    private static func validatedOrigin(_ value: String?) -> URL? {
        guard let value,
              let url = URL(string: value),
              MorrowwardOriginPolicy(origin: url) != nil else {
            return nil
        }
        return url
    }

    #if DEBUG
    private static var debugOverride: String? {
        if let environmentValue = ProcessInfo.processInfo.environment["MORROWWARD_ORIGIN"] {
            return environmentValue
        }

        let arguments = ProcessInfo.processInfo.arguments
        guard let flagIndex = arguments.firstIndex(of: "--morrowward-origin"),
              arguments.indices.contains(flagIndex + 1) else {
            return nil
        }
        return arguments[flagIndex + 1]
    }

    static func validatedDebugOrigin(_ value: String) -> URL? {
        guard let url = validatedOrigin(value),
              let host = url.host?.lowercased() else {
            return nil
        }

        if MorrowwardOriginPolicy(origin: productionOrigin)?.contains(url) == true {
            return url
        }

        guard host == "localhost" || host == "127.0.0.1" else {
            return nil
        }
        return url
    }
    #endif
}
