// src/navigation/AppNavigator.js
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { C } from '../utils/theme';

// Auth
import SplashScreen                from '../screens/auth/SplashScreen';
import LoginScreen                 from '../screens/auth/LoginScreen';
import SignupScreen                from '../screens/auth/SignupScreen';
import RoleSelectScreen            from '../screens/auth/RoleSelectScreen';

// Passenger
import PassengerHome               from '../screens/passenger/PassengerHome';
import BookingScreen               from '../screens/passenger/BookingScreen';
import FindingDriverScreen         from '../screens/passenger/FindingDriverScreeen';
import DriverFoundScreen           from '../screens/passenger/DriverFoundScreen';
import ActiveRideScreen            from '../screens/passenger/ActiveRideScreen';
import RideCompleteScreen          from '../screens/passenger/RideCompleteScreen';

// Driver
import DriverHomeScreen            from '../screens/driver/DriverHomeScreen';
import DriverAcceptRideScreen      from '../screens/driver/DriverAcceptRideScreen';

// Safety
import FakeCallScreen              from '../screens/safety/FakeCallScreen';
import SOSScreen                   from '../screens/safety/SOSScreen';
import SafePointsScreen            from '../screens/safety/SafePointsScreen';
import SafetyCenterScreen          from '../screens/safety/SafetyCenterScreen';

// Shared
import ProfileScreen               from '../screens/shared/ProfileScreen';
import RideHistoryScreen           from '../screens/shared/RideHistoryScreen';
import WalletScreen                from '../screens/shared/WalletScreen';
import NotificationsScreen         from '../screens/shared/NotificationsScreen';
import GuardianSetupScreen         from '../screens/shared/GuardianSetupScreen';

// Admin
import AdminDriverApprovalScreen   from '../screens/shared/AdminDriverApprovalScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, mode, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.rose} />
      </View>
    );
  }

  // Determine initial route from the session and the chosen mode
  const getInitial = () => {
    if (!user) return 'Splash';
    if (user.role === 'admin') return 'AdminPanel';
    if (!mode)                 return 'RoleSelect';
    return mode === 'driver' ? 'DriverHome' : 'PassengerHome';
  };

  // Keying the container (which holds the navigation state) on the session
  // and mode resets navigation on login / logout / mode switch, so the user
  // lands on the right home screen. Keying only the Stack.Navigator is not
  // enough — the container would restore the previous route.
  const sessionKey = user ? `${user._id}:${user.role}:${mode || 'choose'}` : 'guest';

  return (
    <NavigationContainer key={sessionKey}>
      <Stack.Navigator
        initialRouteName={getInitial()}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          animation: 'slide_from_right',
        }}
      >
        {/* Auth */}
        <Stack.Screen name="Splash"         component={SplashScreen} />
        <Stack.Screen name="Login"          component={LoginScreen} />
        <Stack.Screen name="Signup"         component={SignupScreen} />
        <Stack.Screen name="RoleSelect"     component={RoleSelectScreen} />

        {/* Passenger */}
        <Stack.Screen name="PassengerHome"  component={PassengerHome} />
        <Stack.Screen name="Booking"        component={BookingScreen} />
        <Stack.Screen name="FindingDriver"  component={FindingDriverScreen} />
        <Stack.Screen name="DriverFound"    component={DriverFoundScreen} />
        <Stack.Screen name="ActiveRide"     component={ActiveRideScreen} />
        <Stack.Screen name="RideComplete"   component={RideCompleteScreen} />

        {/* Driver */}
        <Stack.Screen name="DriverHome"        component={DriverHomeScreen} />
        <Stack.Screen name="DriverAcceptRide"  component={DriverAcceptRideScreen} />

        {/* Safety */}
        <Stack.Screen name="FakeCall"       component={FakeCallScreen} />
        <Stack.Screen name="SOSScreen"      component={SOSScreen} />
        <Stack.Screen name="SafePoints"     component={SafePointsScreen} />
        <Stack.Screen name="SafetyCenter"   component={SafetyCenterScreen} />

        {/* Shared */}
        <Stack.Screen name="Profile"        component={ProfileScreen} />
        <Stack.Screen name="RideHistory"    component={RideHistoryScreen} />
        <Stack.Screen name="Wallet"         component={WalletScreen} />
        <Stack.Screen name="Notifications"  component={NotificationsScreen} />
        <Stack.Screen name="GuardianSetup"  component={GuardianSetupScreen} />

        {/* Admin */}
        <Stack.Screen name="AdminPanel"     component={AdminDriverApprovalScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}