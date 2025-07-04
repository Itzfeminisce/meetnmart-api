import { Notification, Order, Product, SupportTicket, User } from "../type";

export const products: Product[] = [
    {
      id: 'p1', sellerId: '2', name: 'Fresh Tomatoes', price: 500,
      location: { lat: 7.3776, lng: 3.9471 }, category: 'Vegetables',
      available: true, description: 'Fresh organic tomatoes from local farm',
      images: ['tomato1.jpg', 'tomato2.jpg']
    },
    {
      id: 'p2', sellerId: '2', name: 'Rice Bag (50kg)', price: 15000,
      location: { lat: 7.3776, lng: 3.9471 }, category: 'Grains',
      available: true, description: 'Premium quality rice, 50kg bag',
      images: ['rice1.jpg']
    },
    {
      id: 'p3', sellerId: '3', name: 'iPhone 13', price: 450000,
      location: { lat: 7.3780, lng: 3.9475 }, category: 'Electronics',
      available: true, description: 'Brand new iPhone 13, unlocked',
      images: ['iphone1.jpg', 'iphone2.jpg']
    },
    {
      id: 'p4', sellerId: '3', name: 'Nike Sneakers', price: 25000,
      location: { lat: 7.3780, lng: 3.9475 }, category: 'Fashion',
      available: false, description: 'Nike Air Max sneakers, size 42',
      images: ['nike1.jpg']
    }
  ];


  // Add sample orders
  export const orders: Order[] = [
    {
      id: 'o1', buyerId: '1', sellerId: '2', productId: 'p1',
      status: 'delivered', dispatcherId: '4', createdAt: new Date('2024-01-15')
    },
    {
      id: 'o2', buyerId: '1', sellerId: '3', productId: 'p3',
      status: 'pending', createdAt: new Date('2024-01-20')
    }
  ];

  

  // Add sample notifications
  export const notifications: Notification[] = [
    {
      id: 'n1', userId: '1', type: 'order', title: 'Order Delivered',
      message: 'Your order for Fresh Tomatoes has been delivered',
      read: false, createdAt: new Date('2024-01-15')
    },
    {
      id: 'n2', userId: '2', type: 'order', title: 'New Order',
      message: 'You have received a new order for iPhone 13',
      read: true, createdAt: new Date('2024-01-20')
    }
  ];


  // Add sample support tickets
  export const tickets: SupportTicket[] = [
    {
      id: 't1', userId: '1', subject: 'Payment Issue',
      description: 'Having trouble with payment processing',
      status: 'open', priority: 'high', createdAt: new Date('2024-01-18')
    }
  ];

  export const users: User[] = [
    {
        id: '2', type: 'seller', location: { lat: 7.3776, lng: 3.9471 },
        name: 'Jane Seller', phone: '+234807654321', rating: 4.8, verified: true
    },
    {
        id: '3', type: 'seller', location: { lat: 7.3780, lng: 3.9475 },
        name: 'Mike Merchant', phone: '+234809876543', rating: 4.5, verified: false
    },
    {
        id: '4', type: 'dispatcher', location: { lat: 7.3778, lng: 3.9472 },
        name: 'Dave Dispatcher', phone: '+234806543210', rating: 4.3, verified: true
    }
]