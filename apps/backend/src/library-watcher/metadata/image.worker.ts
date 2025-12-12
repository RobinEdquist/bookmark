// Worker thread for image processing - runs in separate thread to avoid blocking main event loop
import { parentPort } from 'worker_threads';
import sharp from 'sharp';

interface ProcessImageOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
}

interface WorkerTask {
  type: 'processImage';
  imageData: number[]; // Array of bytes
  options: ProcessImageOptions;
  taskId: string;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?: {
    data: number[];
    mimeType: string;
  };
  error?: string;
}

async function processImage(
  imageData: number[],
  options: ProcessImageOptions,
): Promise<{ data: number[]; mimeType: string }> {
  const buffer = Buffer.from(imageData);

  let sharpInstance = sharp(buffer).resize(
    options.maxWidth,
    options.maxHeight,
    {
      fit: 'inside',
      withoutEnlargement: true,
    },
  );

  let mimeType: string;
  switch (options.format) {
    case 'jpeg':
      sharpInstance = sharpInstance.jpeg({ quality: options.quality });
      mimeType = 'image/jpeg';
      break;
    case 'png':
      sharpInstance = sharpInstance.png({ quality: options.quality });
      mimeType = 'image/png';
      break;
    case 'webp':
      sharpInstance = sharpInstance.webp({ quality: options.quality });
      mimeType = 'image/webp';
      break;
    default:
      sharpInstance = sharpInstance.jpeg({ quality: options.quality });
      mimeType = 'image/jpeg';
  }

  const processedBuffer = await sharpInstance.toBuffer();

  return {
    data: Array.from(processedBuffer),
    mimeType,
  };
}

async function handleTask(task: WorkerTask): Promise<WorkerResponse> {
  try {
    let result: { data: number[]; mimeType: string };

    switch (task.type) {
      case 'processImage':
        result = await processImage(task.imageData, task.options);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    return { taskId: task.taskId, success: true, result };
  } catch (error) {
    return {
      taskId: task.taskId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (task: WorkerTask) => {
    const response = await handleTask(task);
    parentPort!.postMessage(response);
  });
}
