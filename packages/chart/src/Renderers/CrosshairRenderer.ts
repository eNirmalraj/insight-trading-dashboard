import { CoordinateSystem } from '../Core/CoordinateSystem';

export class CrosshairRenderer {
    constructor(private ctx: CanvasRenderingContext2D) {}

    public draw(
        x: number | null,
        y: number | null,
        dimensions: { width: number; height: number },
        options: {
            color: string;
            labelColor: string;
            labelTcp: string; // text color or bg? usually bg
        }
    ) {
        if (x === null || y === null) return;

        const { width, height } = dimensions;

        this.ctx.save();
        this.ctx.strokeStyle = options.color;
        this.ctx.setLineDash([4, 4]); // Dashed line
        this.ctx.lineWidth = 1;

        // Vertical Line
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();

        // Horizontal Line
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(width, y);
        this.ctx.stroke();

        this.ctx.restore();
    }
}
