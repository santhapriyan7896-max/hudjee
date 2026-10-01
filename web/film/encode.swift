// Encodes a folder of numbered JPEG frames into an H.264 MP4 with AVFoundation,
// optionally with a WAV laid under it as AAC.
//   encode <frames-dir> <out.mp4> <fps> <bits-per-second> [audio.wav]
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 5 || args.count == 6, let fps = Int32(args[3]), let bitrate = Int(args[4]) else {
    print("usage: encode <frames-dir> <out.mp4> <fps> <bits-per-second> [audio.wav]")
    exit(2)
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let names = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".jpg") }.sorted()
guard let first = names.first,
      let src0 = CGImageSourceCreateWithURL(dir.appendingPathComponent(first) as CFURL, nil),
      let img0 = CGImageSourceCreateImageAtIndex(src0, 0, nil) else {
    print("no frames in \(dir.path)")
    exit(1)
}
let width = img0.width, height = img0.height
try? FileManager.default.removeItem(at: out)

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true   // moov first, so the browser can start before the file is in
let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
        AVVideoExpectedSourceFrameRateKey: Int(fps),
    ],
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
])
video.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(video)

var audio: AVAssetWriterInput?
var reader: AVAssetReader?
var readerOutput: AVAssetReaderTrackOutput?
if args.count == 6 {
    let asset = AVURLAsset(url: URL(fileURLWithPath: args[5]))
    guard let track = asset.tracks(withMediaType: .audio).first else { print("no audio in \(args[5])"); exit(1) }
    let r = try AVAssetReader(asset: asset)
    let o = AVAssetReaderTrackOutput(track: track, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
    ])
    r.add(o)
    let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 48_000,
        AVEncoderBitRateKey: 128_000,
    ])
    a.expectsMediaDataInRealTime = false
    writer.add(a)
    audio = a; reader = r; readerOutput = o
}

guard writer.startWriting() else { print("cannot start: \(String(describing: writer.error))"); exit(1) }
reader?.startReading()
writer.startSession(atSourceTime: .zero)
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let group = DispatchGroup()

// Each track is fed whenever the writer asks for it, so the two interleave.
group.enter()
var frame = 0
var videoDone = false
video.requestMediaDataWhenReady(on: DispatchQueue(label: "video")) {
    while video.isReadyForMoreMediaData && !videoDone {
        if frame >= names.count {
            videoDone = true
            video.markAsFinished()
            group.leave()
            return
        }
        autoreleasepool {
            guard let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(names[frame]) as CFURL, nil),
                  let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("unreadable frame \(names[frame])") }
            var buffer: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
            guard let pb = buffer else { fatalError("no pixel buffer") }
            CVPixelBufferLockBaseAddress(pb, [])
            let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                                bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: space,
                                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
            CVPixelBufferUnlockBaseAddress(pb, [])
            if !adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps)) {
                fatalError("video append failed at \(frame): \(String(describing: writer.error))")
            }
        }
        frame += 1
    }
}

if let a = audio, let o = readerOutput {
    group.enter()
    var audioDone = false
    a.requestMediaDataWhenReady(on: DispatchQueue(label: "audio")) {
        while a.isReadyForMoreMediaData && !audioDone {
            if let sample = o.copyNextSampleBuffer() {
                if !a.append(sample) { fatalError("audio append failed: \(String(describing: writer.error))") }
            } else {
                audioDone = true
                a.markAsFinished()
                group.leave()
                return
            }
        }
    }
}

group.wait()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
guard writer.status == .completed else { print("failed: \(String(describing: writer.error))"); exit(1) }
let size = (try FileManager.default.attributesOfItem(atPath: out.path)[.size] as? Int) ?? 0
print("\(out.lastPathComponent): \(width)x\(height), \(names.count) frames\(audio == nil ? "" : " + AAC audio"), \(String(format: "%.1f", Double(size) / 1_048_576)) MB")
