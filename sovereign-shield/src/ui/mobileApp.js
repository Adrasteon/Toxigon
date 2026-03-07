/**
 * Mobile Application
 * React Native mobile app for Sovereign Shield
 * Supports Android and iOS with VPN service for traffic interception
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Switch,
  Alert,
  Platform
} from 'react-native';

// Import native modules for VPN functionality
import NetInfo from '@react-native-netinfo/netinfo';
import { PermissionsAndroid, NativeModules } from 'react-native';

const { VPNService } = NativeModules;

const MobileApp = () => {
  const [isProtected, setIsProtected] = useState(false);
  const [sensitivityLevel, setSensitivityLevel] = useState(5);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [networkInfo, setNetworkInfo] = useState(null);

  useEffect(() => {
    // Initialize VPN service
    initializeVPN();
    
    // Monitor network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkInfo(state);
    });

    return () => unsubscribe();
  }, []);

  const initializeVPN = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_NETWORK_STATE,
          {
            title: "Sovereign Shield VPN Permission",
            message: "Sovereign Shield needs VPN access to protect your content.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'VPN functionality requires network permissions.');
          return;
        }
      }

      // Initialize VPN service
      await VPNService.initialize();
    } catch (error) {
      console.error('VPN initialization failed:', error);
    }
  };

  const toggleProtection = async () => {
    try {
      if (!isProtected) {
        // Start VPN protection
        const result = await VPNService.startVPN();
        if (result.success) {
          setIsProtected(true);
          setConnectionStatus('connected');
          Alert.alert('Protection Active', 'Your content is now being filtered.');
        }
      } else {
        // Stop VPN protection
        const result = await VPNService.stopVPN();
        if (result.success) {
          setIsProtected(false);
          setConnectionStatus('disconnected');
          Alert.alert('Protection Paused', 'Content filtering is now disabled.');
        }
      }
    } catch (error) {
      console.error('VPN toggle failed:', error);
      Alert.alert('Error', 'Failed to toggle protection. Please try again.');
    }
  };

  const updateSensitivity = async (newLevel) => {
    setSensitivityLevel(newLevel);
    
    try {
      // Send to native module to update policy
      await VPNService.updateSensitivity(newLevel);
    } catch (error) {
      console.error('Failed to update sensitivity:', error);
    }
  };

  const showStats = () => {
    Alert.alert(
      'Protection Statistics',
      `Sensitivity Level: ${sensitivityLevel}\nStatus: ${connectionStatus}\nNetwork: ${networkInfo?.type || 'Unknown'}`,
      [{ text: 'OK' }]
    );
  };

  const exportLogs = async () => {
    try {
      const result = await VPNService.exportLogs();
      if (result.success) {
        Alert.alert('Success', `Logs exported to: ${result.filepath}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export logs.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Sovereign Shield</Text>
        <Text style={styles.subtitle}>Privacy-First Content Protection</Text>
      </View>

      {/* Protection Status */}
      <View style={styles.statusCard}>
        <View style={[styles.statusIndicator, { backgroundColor: isProtected ? '#10b981' : '#ef4444' }]} />
        <Text style={styles.statusText}>
          {isProtected ? 'PROTECTED' : 'NOT PROTECTED'}
        </Text>
        <Text style={styles.statusDetail}>
          {isProtected ? 'Your content is being filtered' : 'Enable protection to filter content'}
        </Text>
      </View>

      {/* Control Panel */}
      <View style={styles.controlPanel}>
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Content Protection</Text>
          <Switch
            value={isProtected}
            onValueChange={toggleProtection}
            thumbColor={isProtected ? "#fff" : "#f4f4f5"}
            trackColor={{ false: "#9ca3af", true: "#22c55e" }}
          />
        </View>

        <View style={styles.sensitivityControl}>
          <Text style={styles.controlLabel}>Sensitivity Level</Text>
          <Text style={styles.sensitivityValue}>{sensitivityLevel}/10</Text>
          <View style={styles.sliderContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.sensitivityDot,
                  level <= sensitivityLevel && styles.sensitivityDotActive
                ]}
                onPress={() => updateSensitivity(level)}
              />
            ))}
          </View>
          <View style={styles.sensitivityLabels}>
            <Text style={styles.sensitivityLabel}>Lax</Text>
            <Text style={styles.sensitivityLabel}>Strict</Text>
          </View>
        </View>

        <View style={styles.networkInfo}>
          <Text style={styles.networkLabel}>Network Status</Text>
          <Text style={styles.networkValue}>
            {networkInfo?.type || 'Unknown'} • {connectionStatus}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton} onPress={showStats}>
          <Text style={styles.actionButtonText}>View Statistics</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={exportLogs}>
          <Text style={styles.actionButtonText}>Export Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Sovereign Shield protects your privacy by filtering content locally.
          No data leaves your device.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#2563eb',
    padding: 24,
    paddingTop: Platform.OS === 'android' ? 32 : 56,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#bfdbfe',
    opacity: 0.9,
  },
  statusCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    flex: 1,
  },
  statusDetail: {
    fontSize: 12,
    color: '#6b7280',
  },
  controlPanel: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  controlLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  sensitivityControl: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sensitivityValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
    textAlign: 'center',
    marginVertical: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 8,
  },
  sensitivityDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 2,
  },
  sensitivityDotActive: {
    backgroundColor: '#2563eb',
  },
  sensitivityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sensitivityLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  networkInfo: {
    paddingVertical: 12,
  },
  networkLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  networkValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  actionButtons: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  actionButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default MobileApp;