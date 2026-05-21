export interface BookOrderRequest {
  location: string;
  time: string;
  people: number;
  estimatedAmount: number;
}

export interface BookOrderResponse {
  success: boolean;
  orderId?: string;
  message: string;
}

export async function executeBooking(request: BookOrderRequest): Promise<BookOrderResponse> {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const orderId = `ORD${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    success: true,
    orderId,
    message: `预订成功！订单号：${orderId}。地点：${request.location}，时间：${request.time}，人数：${request.people}，预估金额：${request.estimatedAmount}元。`,
  };
}

export const bookOrderToolDefinition = {
  name: "executeBooking",
  description: "执行预订下单操作。当用户确认需要预订某项服务（如餐厅、酒店、景点门票等）时调用此工具。",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "预订地点或服务名称",
      },
      time: {
        type: "string",
        description: "预订时间，格式为 YYYY-MM-DD HH:mm",
      },
      people: {
        type: "number",
        description: "预订人数或数量",
      },
      estimatedAmount: {
        type: "number",
        description: "预估金额，单位元",
      },
    },
    required: ["location", "time", "people", "estimatedAmount"],
  },
};
