import type { RefCallback } from "react";
import { FACE_LAYER_ASSETS, type FaceLayerAsset } from "../../config/faceLayerAssets";
import type { LayerPosition } from "../../config/faceLayerLayouts";

export default function FaceLayer({ asset, position, order, motionRef, motionRole, initialOpacity = 1, animate = false }: {
    asset: FaceLayerAsset;
    position: LayerPosition;
    order: number;
    motionRef?: RefCallback<HTMLDivElement>;
    motionRole?: string;
    initialOpacity?: number;
    animate?: boolean;
}) {
    const image = FACE_LAYER_ASSETS[asset];
    const src = animate && "animatedSrc" in image ? image.animatedSrc : image.src;
    if (motionRef) return <div ref={motionRef} className="face-layer face-element-motion"
        data-element-role={motionRole} style={{
            left: (position.x / 800 * 100) + "%", top: (position.y / 480 * 100) + "%",
            width: (position.width / 800 * 100) + "%", height: (position.height / 480 * 100) + "%",
            zIndex: order, opacity: initialOpacity,
        }}>
        <img className="face-element-image" src={src} alt="" aria-hidden="true"
            draggable={false} width={image.width} height={image.height} data-layer={asset} />
    </div>;
    return (
        <img
            className="face-layer"
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={image.width}
            height={image.height}
            data-layer={asset}
            style={{
                left: `${position.x / 800 * 100}%`,
                top: `${position.y / 480 * 100}%`,
                width: `${position.width / 800 * 100}%`,
                height: `${position.height / 480 * 100}%`,
                zIndex: order,
            }}
        />
    );
}
