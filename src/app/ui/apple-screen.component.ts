import type { ElementRef, OnDestroy } from '@angular/core';
import { ChangeDetectionStrategy, Component, afterNextRender, input, viewChild } from '@angular/core';

import { HIRES_HEIGHT, HIRES_WIDTH } from '../runtime/apple-hires.constants';
import type { IApplePalette } from '../runtime/apple-palette';
import { NTSC_ARTIFACT_PALETTE } from '../runtime/apple-palette';
import type { IRenderableScreen } from '../runtime/display';


/**
 * Shows the emulated screen. The canvas is always the machine's own 280 x 192 pixels and is
 * stretched by whole numbers only, so a pixel stays a square block of pixels and the picture
 * never blurs or shears the way a fractional scale would.
 */
@Component({
  selector: 'wiz-apple-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<canvas #screen [width]="width" [height]="height"></canvas>',
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #000;
    }

    canvas {
      image-rendering: pixelated;
      display: block;
    }
  `],
})
export class AppleScreenComponent implements OnDestroy {
  public readonly screen = input.required<IRenderableScreen>();
  public readonly palette = input<IApplePalette>(NTSC_ARTIFACT_PALETTE);

  public readonly width: number = HIRES_WIDTH;
  public readonly height: number = HIRES_HEIGHT;

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('screen');

  private readonly pixels: ImageData = new ImageData(HIRES_WIDTH, HIRES_HEIGHT);
  private context: CanvasRenderingContext2D | null = null;
  private frameHandle: number = 0;
  private resizeObserver: ResizeObserver | undefined;


  constructor() {
    afterNextRender((): void => {
      const canvas: HTMLCanvasElement = this.canvasRef().nativeElement;

      this.context = canvas.getContext('2d');
      this.observeSize(canvas);
      this.paintLoop();
    });
  }


  public ngOnDestroy(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
  }


  private paintLoop(): void {
    const screen: IRenderableScreen = this.screen();

    if (screen.dirty && (this.context != null)) {
      screen.render(this.pixels.data, this.palette());
      this.context.putImageData(this.pixels, 0, 0);
      screen.dirty = false;
    }

    this.frameHandle = requestAnimationFrame((): void => this.paintLoop());
  }


  private observeSize(canvas: HTMLCanvasElement): void {
    const host: HTMLElement | null = canvas.parentElement;

    if (host != null) {
      this.resizeObserver = new ResizeObserver((): void => this.fit(canvas, host));
      this.resizeObserver.observe(host);
      this.fit(canvas, host);
    }
  }


  private fit(canvas: HTMLCanvasElement, host: HTMLElement): void {
    // A whole-number scale keeps every machine pixel the same size on screen. Below 1 there is
    // nothing sensible to round to, so the canvas is simply fitted to the width it has.
    const scale: number = Math.floor(Math.min(host.clientWidth / HIRES_WIDTH, host.clientHeight / HIRES_HEIGHT));

    if (scale >= 1) {
      canvas.style.width = `${ HIRES_WIDTH * scale }px`;
      canvas.style.height = `${ HIRES_HEIGHT * scale }px`;
    } else {
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    }
  }

}
