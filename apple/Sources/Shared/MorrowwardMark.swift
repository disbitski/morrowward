import SwiftUI

struct MorrowwardMark: View {
    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            ZStack {
                Circle()
                    .fill(Color(red: 0.045, green: 0.065, blue: 0.09))
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [MorrowwardPalette.gold, MorrowwardPalette.orange],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: max(1.4, size * 0.055)
                    )

                HStack(alignment: .bottom, spacing: size * 0.075) {
                    bar(height: size * 0.22)
                    bar(height: size * 0.36)
                    bar(height: size * 0.53)
                }
                .frame(height: size * 0.58, alignment: .bottom)
                .offset(y: size * 0.04)

                Circle()
                    .trim(from: 0.58, to: 0.91)
                    .stroke(MorrowwardPalette.gold.opacity(0.78), style: .init(lineWidth: max(1, size * 0.035), lineCap: .round))
                    .rotationEffect(.degrees(24))
                    .padding(size * 0.11)
            }
            .frame(width: size, height: size)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    private func bar(height: CGFloat) -> some View {
        Capsule(style: .continuous)
            .fill(
                LinearGradient(
                    colors: [MorrowwardPalette.gold, MorrowwardPalette.orange],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: height * 0.23, height: height)
    }
}
enum MorrowwardPalette {
    static let orange = Color(red: 1.0, green: 0.42, blue: 0.07)
    static let gold = Color(red: 1.0, green: 0.72, blue: 0.22)
    static let ink = Color(red: 0.025, green: 0.04, blue: 0.06)
}
