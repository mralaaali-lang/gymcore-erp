import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/services/auth';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications, Notifications } from './src/services/pushNotifications';

function NotificationHandler({ children }: { children: React.ReactNode }) {
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    registerForPushNotifications();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response.notification.request.content.data);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationHandler>
        <StatusBar style="light" />
        <AppNavigator />
      </NotificationHandler>
    </AuthProvider>
  );
}
