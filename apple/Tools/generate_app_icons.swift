#!/usr/bin/env swift

import AppKit
import CoreGraphics
import Foundation

private struct RGB {
    let red: CGFloat
    let green: CGFloat
    let blue: CGFloat
    let alpha: CGFloat

    init(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat, _ alpha: CGFloat = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    var color: CGColor {
        CGColor(red: red, green: green, blue: blue, alpha: alpha)
    }
}

private let midnight = RGB(0.010, 0.020, 0.045)
private let deepNavy = RGB(0.018, 0.060, 0.115)
private let horizonNavy = RGB(0.030, 0.105, 0.160)
private let ember = RGB(1.000, 0.285, 0.035)
private let orange = RGB(1.000, 0.430, 0.055)
private let gold = RGB(1.000, 0.700, 0.180)
private let warmWhite = RGB(1.000, 0.940, 0.770)

private let starPositions: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
    (0.12, 0.79, 0.85, 1.2), (0.20, 0.61, 0.45, 0.8),
    (0.29, 0.87, 0.55, 0.9), (0.39, 0.72, 0.35, 0.7),
    (0.51, 0.91, 0.70, 1.0), (0.60, 0.81, 0.40, 0.8),
    (0.73, 0.89, 0.58, 0.9), (0.84, 0.70, 0.42, 0.7),
    (0.91, 0.84, 0.75, 1.1), (0.76, 0.57, 0.32, 0.7),
    (0.16, 0.48, 0.30, 0.7), (0.88, 0.47, 0.38, 0.7)
]

private func gradient(_ colors: [RGB], locations: [CGFloat]) -> CGGradient {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let cgColors = colors.map(\.color) as CFArray
    guard let gradient = CGGradient(
        colorsSpace: colorSpace,
        colors: cgColors,
        locations: locations
    ) else {
        fatalError("Unable to construct icon gradient")
    }
    return gradient
}

private func renderIcon(pixelSize: Int) -> CGImage {
    let size = CGFloat(pixelSize)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: pixelSize,
        height: pixelSize,
        bitsPerComponent: 8,
        bytesPerRow: pixelSize * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        fatalError("Unable to create a \(pixelSize)x\(pixelSize) bitmap context")
    }

    context.setAllowsAntialiasing(true)
    context.setShouldAntialias(true)

    // The canvas remains a full square. Apple applies the platform-specific mask.
    context.setFillColor(midnight.color)
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))

    let background = gradient(
        [midnight, deepNavy, horizonNavy, RGB(0.075, 0.045, 0.035)],
        locations: [0.0, 0.43, 0.72, 1.0]
    )
    context.drawLinearGradient(
        background,
        start: CGPoint(x: size * 0.10, y: size),
        end: CGPoint(x: size * 0.88, y: 0),
        options: []
    )

    let horizonGlow = gradient(
        [RGB(1.0, 0.26, 0.02, 0.28), RGB(1.0, 0.48, 0.05, 0.10), RGB(1.0, 0.48, 0.05, 0.0)],
        locations: [0.0, 0.42, 1.0]
    )
    context.drawRadialGradient(
        horizonGlow,
        startCenter: CGPoint(x: size * 0.58, y: size * 0.25),
        startRadius: 0,
        endCenter: CGPoint(x: size * 0.58, y: size * 0.25),
        endRadius: size * 0.62,
        options: [.drawsAfterEndLocation]
    )

    if pixelSize >= 64 {
        for star in starPositions {
            let radius = max(0.55, size * 0.0019 * star.3)
            context.setFillColor(RGB(1.0, 0.94, 0.78, star.2).color)
            context.fillEllipse(in: CGRect(
                x: size * star.0 - radius,
                y: size * star.1 - radius,
                width: radius * 2,
                height: radius * 2
            ))
        }
    }

    // Thin orbital paths imply a long horizon without competing with the mark.
    context.saveGState()
    context.translateBy(x: size * 0.52, y: size * 0.37)
    context.rotate(by: -0.22)
    context.setLineWidth(max(0.7, size * 0.0025))
    context.setStrokeColor(RGB(1.0, 0.43, 0.07, 0.30).color)
    context.strokeEllipse(in: CGRect(
        x: -size * 0.47,
        y: -size * 0.15,
        width: size * 0.94,
        height: size * 0.30
    ))
    context.restoreGState()

    if pixelSize >= 32 {
        context.saveGState()
        context.translateBy(x: size * 0.56, y: size * 0.38)
        context.rotate(by: 0.56)
        context.setLineWidth(max(0.55, size * 0.0016))
        context.setStrokeColor(RGB(1.0, 0.72, 0.24, 0.15).color)
        context.strokeEllipse(in: CGRect(
            x: -size * 0.33,
            y: -size * 0.10,
            width: size * 0.66,
            height: size * 0.20
        ))
        context.restoreGState()
    }

    // Four rising columns are the Morrowward promise: small habits becoming visible.
    let bars: [(x: CGFloat, height: CGFloat)] = [
        (0.235, 0.205),
        (0.365, 0.315),
        (0.495, 0.445),
        (0.625, 0.585)
    ]
    let barWidth = size * 0.092
    let baseline = size * 0.165
    let barGradient = gradient([ember, orange, gold], locations: [0.0, 0.55, 1.0])

    for bar in bars {
        let rect = CGRect(
            x: size * bar.x,
            y: baseline,
            width: barWidth,
            height: size * bar.height
        )
        let path = CGPath(
            roundedRect: rect,
            cornerWidth: min(barWidth * 0.24, size * 0.018),
            cornerHeight: min(barWidth * 0.24, size * 0.018),
            transform: nil
        )

        context.saveGState()
        context.setShadow(
            offset: CGSize(width: 0, height: -size * 0.004),
            blur: size * 0.026,
            color: RGB(1.0, 0.30, 0.02, 0.50).color
        )
        context.addPath(path)
        context.clip()
        context.drawLinearGradient(
            barGradient,
            start: CGPoint(x: rect.minX, y: rect.minY),
            end: CGPoint(x: rect.maxX, y: rect.maxY),
            options: []
        )
        context.restoreGState()

        if pixelSize >= 64 {
            context.saveGState()
            context.addPath(path)
            context.clip()
            let highlight = gradient(
                [RGB(1.0, 0.95, 0.72, 0.36), RGB(1.0, 0.95, 0.72, 0.0)],
                locations: [0.0, 1.0]
            )
            context.drawLinearGradient(
                highlight,
                start: CGPoint(x: rect.minX, y: rect.maxY),
                end: CGPoint(x: rect.maxX, y: rect.minY),
                options: []
            )
            context.restoreGState()
        }
    }

    // The future-point beacon gives the tallest column a hopeful destination.
    let beaconCenter = CGPoint(x: size * 0.671, y: size * 0.802)
    let beaconGlow = gradient(
        [RGB(1.0, 0.84, 0.34, 0.62), RGB(1.0, 0.45, 0.04, 0.17), RGB(1.0, 0.45, 0.04, 0.0)],
        locations: [0.0, 0.34, 1.0]
    )
    context.drawRadialGradient(
        beaconGlow,
        startCenter: beaconCenter,
        startRadius: 0,
        endCenter: beaconCenter,
        endRadius: size * 0.095,
        options: [.drawsAfterEndLocation]
    )
    let beaconRadius = max(1.0, size * 0.011)
    context.setFillColor(warmWhite.color)
    context.fillEllipse(in: CGRect(
        x: beaconCenter.x - beaconRadius,
        y: beaconCenter.y - beaconRadius,
        width: beaconRadius * 2,
        height: beaconRadius * 2
    ))

    // A restrained vignette keeps focus on the ascending mark at every icon size.
    let vignette = gradient(
        [RGB(0.0, 0.0, 0.0, 0.0), RGB(0.0, 0.0, 0.0, 0.05), RGB(0.0, 0.0, 0.0, 0.40)],
        locations: [0.0, 0.65, 1.0]
    )
    context.drawRadialGradient(
        vignette,
        startCenter: CGPoint(x: size * 0.53, y: size * 0.48),
        startRadius: size * 0.15,
        endCenter: CGPoint(x: size * 0.53, y: size * 0.48),
        endRadius: size * 0.74,
        options: [.drawsAfterEndLocation]
    )

    guard let image = context.makeImage() else {
        fatalError("Unable to create icon image")
    }
    return image
}

private func writePNG(pixelSize: Int, to destination: URL) throws {
    let image = renderIcon(pixelSize: pixelSize)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let opaqueContext = CGContext(
        data: nil,
        width: pixelSize,
        height: pixelSize,
        bitsPerComponent: 8,
        bytesPerRow: pixelSize * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        throw CocoaError(.fileWriteUnknown)
    }

    opaqueContext.setBlendMode(.copy)
    opaqueContext.draw(
        image,
        in: CGRect(x: 0, y: 0, width: pixelSize, height: pixelSize)
    )
    guard let opaqueImage = opaqueContext.makeImage() else {
        throw CocoaError(.fileWriteUnknown)
    }

    let representation = NSBitmapImageRep(cgImage: opaqueImage)
    guard let data = representation.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    try data.write(to: destination, options: .atomic)
    print("Generated \(destination.lastPathComponent) (\(pixelSize)x\(pixelSize))")
}

let scriptURL = URL(fileURLWithPath: #filePath).standardizedFileURL
let repositoryRoot = scriptURL
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()

let iOSCatalog = repositoryRoot
    .appendingPathComponent("apple/Resources/iOS/Assets.xcassets/AppIcon.appiconset", isDirectory: true)
let macOSCatalog = repositoryRoot
    .appendingPathComponent("apple/Resources/macOS/Assets.xcassets/AppIcon.appiconset", isDirectory: true)

try FileManager.default.createDirectory(at: iOSCatalog, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: macOSCatalog, withIntermediateDirectories: true)

try writePNG(pixelSize: 1024, to: iOSCatalog.appendingPathComponent("AppIcon-1024.png"))

let macIcons: [(filename: String, pixels: Int)] = [
    ("AppIcon-16.png", 16),
    ("AppIcon-16@2x.png", 32),
    ("AppIcon-32.png", 32),
    ("AppIcon-32@2x.png", 64),
    ("AppIcon-128.png", 128),
    ("AppIcon-128@2x.png", 256),
    ("AppIcon-256.png", 256),
    ("AppIcon-256@2x.png", 512),
    ("AppIcon-512.png", 512),
    ("AppIcon-512@2x.png", 1024)
]

for icon in macIcons {
    try writePNG(pixelSize: icon.pixels, to: macOSCatalog.appendingPathComponent(icon.filename))
}

print("Morrowward Apple app icons are ready.")
