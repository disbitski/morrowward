import SwiftUI
import UniformTypeIdentifiers
import WebKit

@MainActor
struct MorrowwardCompanionView: View {
    @State private var browser = MorrowwardBrowserModel()

    var body: some View {
        NavigationStack {
            ZStack {
                MorrowwardPalette.ink
                    .ignoresSafeArea()

                WebView(browser.page)
                    .webViewBackForwardNavigationGestures(.enabled)
                    .webViewLinkPreviews(.disabled)
                    .webViewContentBackground(.visible)

                if !browser.hasLoadedContent {
                    nativeLaunchState
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .top) {
                if browser.page.isLoading && browser.hasLoadedContent {
                    ProgressView(value: browser.progress)
                        .progressViewStyle(.linear)
                        .tint(MorrowwardPalette.orange)
                        .accessibilityLabel("Loading Morrowward")
                }
            }
            .overlay(alignment: .bottom) {
                if browser.loadState == .failed && browser.hasLoadedContent {
                    connectionBanner
                        .padding()
                }
            }
            .navigationTitle("Morrowward")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItemGroup(placement: .navigation) {
                    Button(action: browser.goBack) {
                        Label("Back", systemImage: "chevron.backward")
                    }
                    .disabled(!browser.canGoBack)
                    .help("Back")

                    Button(action: browser.goForward) {
                        Label("Forward", systemImage: "chevron.forward")
                    }
                    .disabled(!browser.canGoForward)
                    .help("Forward")
                }

                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        MorrowwardMark()
                            .frame(width: 26, height: 26)
                        Text("Morrowward")
                            .font(.headline.weight(.bold))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Morrowward companion")
                }

                ToolbarItemGroup(placement: .primaryAction) {
                    Button(action: browser.reload) {
                        Label("Reload", systemImage: "arrow.clockwise")
                    }
                    .help("Reload Morrowward")

                    Button(action: browser.openInSystemBrowser) {
                        Label("Open in browser", systemImage: "safari")
                    }
                    .help("Open this page in the default browser")
                }
            }
        }
        .tint(MorrowwardPalette.orange)
        .preferredColorScheme(.dark)
        .fileExporter(
            isPresented: Binding(
                get: { browser.pendingBackup != nil },
                set: { isPresented in
                    if !isPresented {
                        browser.finishBackupExport()
                    }
                }
            ),
            document: browser.backupDocument,
            contentType: .json,
            defaultFilename: browser.backupFilename
        ) { _ in
            browser.finishBackupExport()
        }
        .task {
            browser.start()
        }
        .onDisappear {
            browser.stop()
        }
        #if os(macOS)
        .frame(minWidth: 900, minHeight: 660)
        #endif
    }

    @ViewBuilder
    private var nativeLaunchState: some View {
        if browser.loadState == .failed {
            ConnectionErrorView(
                message: browser.errorMessage ?? "Morrowward could not load.",
                retry: browser.reload,
                openInBrowser: browser.openInSystemBrowser
            )
        } else {
            LoadingView(progress: browser.progress)
        }
    }

    private var connectionBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(MorrowwardPalette.orange)
            Text("The latest page could not load. Your existing local view is still available.")
                .font(.callout)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("Retry", action: browser.reload)
                .buttonStyle(.borderedProminent)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

private struct LoadingView: View {
    let progress: Double

    var body: some View {
        VStack(spacing: 18) {
            MorrowwardMark()
                .frame(width: 86, height: 86)
                .shadow(color: MorrowwardPalette.orange.opacity(0.35), radius: 28)

            VStack(spacing: 7) {
                Text("Morrowward")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                Text("Small steps. A future you can see.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.68))
            }

            ProgressView(value: progress)
                .progressViewStyle(.linear)
                .tint(MorrowwardPalette.orange)
                .frame(maxWidth: 240)

            Label("Your saved plan stays in this app's private local storage", systemImage: "lock.fill")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.58))
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            RadialGradient(
                colors: [MorrowwardPalette.orange.opacity(0.18), MorrowwardPalette.ink],
                center: .center,
                startRadius: 20,
                endRadius: 520
            )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Loading Morrowward. Your saved plan stays in this app's private local storage.")
    }
}

private struct ConnectionErrorView: View {
    let message: String
    let retry: () -> Void
    let openInBrowser: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            MorrowwardMark()
                .frame(width: 72, height: 72)

            VStack(spacing: 8) {
                Text("The horizon is temporarily out of view.")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 460)
            }

            HStack(spacing: 10) {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
                Button("Open in browser", action: openInBrowser)
                    .buttonStyle(.bordered)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MorrowwardPalette.ink)
    }
}
