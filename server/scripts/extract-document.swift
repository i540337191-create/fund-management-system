import Foundation
import PDFKit
import Vision
import AppKit

func recognize(_ image: CGImage) throws -> String {
    guard image.width <= 20000, image.height <= 20000, image.width * image.height <= 40000000 else { throw NSError(domain: "image_dimension_limit", code: 1) }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(cgImage: image).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}
let url = URL(fileURLWithPath: CommandLine.arguments[1])
var pages: [[String: Any]] = []
if CommandLine.arguments[2] == "pdf" {
    guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0, document.pageCount <= 200 else { throw NSError(domain: "invalid_pdf_or_page_limit", code: 1) }
    for number in 0..<document.pageCount {
        guard let page = document.page(at: number) else { throw NSError(domain: "missing_page", code: 1) }
        var text = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var method = "pdf_text"
        // A page containing an image still needs OCR even if a small header has a text layer.
        do {
            let image = page.thumbnail(of: NSSize(width: 1800, height: 2400), for: .mediaBox)
            guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw NSError(domain: "render_failed", code: 1) }
            let scanned = try recognize(cg)
            if !scanned.isEmpty {
                if text.count < 80 { text = scanned; method = "vision_ocr" }
                else { text += "\n" + scanned; method = "pdf_text+vision_ocr" }
            }
        }
        pages.append(["page": number + 1, "text": text, "method": method])
    }
} else {
    guard let image = NSImage(contentsOf: url), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { throw NSError(domain: "invalid_image", code: 1) }
    pages.append(["page": 1, "text": try recognize(cg), "method": "vision_ocr"])
}
let data = try JSONSerialization.data(withJSONObject: pages)
FileHandle.standardOutput.write(data)
