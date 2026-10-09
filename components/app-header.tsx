import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import { getBranches } from '@/services/api';
import { Branch } from '@/types';

export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const router = useRouter();
  const { colors, isDark, toggleTheme } = useAppTheme();
  const {
    user,
    isAdmin,
    isManager,
    activeBranchFilter,
    setActiveBranchFilter,
    logout,
    isCloudConnected,
    dbErrorMessage,
    refreshCloudStatus,
  } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [isRetryingDb, setIsRetryingDb] = useState(false);

  useEffect(() => {
    if (isAdmin && isCloudConnected) {
      getBranches().then(setBranches).catch(console.warn);
    }
  }, [isAdmin, isCloudConnected]);

  const handleRetryConnection = async () => {
    setIsRetryingDb(true);
    try {
      await refreshCloudStatus();
      if (isAdmin) {
        const brs = await getBranches();
        setBranches(brs);
      }
    } catch {
      // error state is handled by subscribeDatabaseStatus
    } finally {
      setIsRetryingDb(false);
    }
  };

  const activeBranchName =
    activeBranchFilter === 'all'
      ? 'All Branches'
      : branches.find((b) => b.id === activeBranchFilter)?.name || user?.branch_name || 'Selected Branch';

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {/* Top row: Brand & Actions */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={[styles.miniLogo, { borderColor: colors.border }]}>
            <Image
              source={require('@/assets/images/ksm-logo.png')}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={[styles.brandText, { color: colors.text }]}>KSM Pvt Ltd</Text>
            <Text style={[styles.roleBadgeText, { color: colors.textSecondary }]}>
              {isAdmin ? 'Super Admin' : `Manager: ${user?.name || user?.username}`}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {/* Theme Toggle */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.borderLight, borderColor: colors.border }]}
            onPress={toggleTheme}
          >
            <Ionicons
              name={isDark ? 'sunny' : 'moon'}
              size={17}
              color={isDark ? '#FBBF24' : colors.text}
            />
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={17} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom row: Branch Switcher / Indicator */}
      <View style={styles.bottomRow}>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.branchSelectorBtn, { backgroundColor: colors.borderLight, borderColor: colors.border }]}
            onPress={() => setShowBranchModal(true)}
          >
            <Ionicons name="business" size={15} color={colors.primary} />
            <Text style={[styles.branchSelectorText, { color: colors.text }]} numberOfLines={1}>
              {activeBranchName}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.branchLockedPill, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="business" size={14} color={colors.primary} />
            <Text style={[styles.branchLockedText, { color: colors.primary }]} numberOfLines={1}>
              Branch: {user?.branch_name || 'My Branch'}
            </Text>
          </View>
        )}

        {title && (
          <View style={styles.titleContainer}>
            <Text style={[styles.screenTitle, { color: colors.text }]}>{title}</Text>
            {subtitle && (
              <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Online Database Error Banner (Shown whenever unable to connect to online database) */}
      {(!isCloudConnected || dbErrorMessage) && (
        <View style={styles.dbErrorBanner}>
          <Ionicons name="warning" size={18} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={styles.dbErrorTitle}>Online Database Connection Error</Text>
            <Text style={styles.dbErrorSub}>
              {dbErrorMessage ||
                'Unable to connect to the online database. Offline backup database is disabled — please check your internet connection or database settings.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={styles.dbRetryBtn}
              onPress={handleRetryConnection}
              disabled={isRetryingDb}
            >
              <Ionicons name="refresh" size={13} color="#FFFFFF" />
              <Text style={styles.dbRetryBtnText}>
                {isRetryingDb ? '...' : 'Retry'}
              </Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.dbRetryBtn, { backgroundColor: '#1E293B' }]}
                onPress={() => router.push('/modal-db-settings')}
              >
                <Ionicons name="server-outline" size={13} color="#FFFFFF" />
                <Text style={styles.dbRetryBtnText}>Config</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Admin Branch Picker Modal */}
      {isAdmin && (
        <Modal
          visible={showBranchModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBranchModal(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowBranchModal(false)}
          >
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalSheetHeader}>
                <Text style={[styles.modalSheetTitle, { color: colors.text }]}>
                  Select Branch Scope
                </Text>
                <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* All Branches option */}
              <TouchableOpacity
                style={[
                  styles.branchOptionItem,
                  activeBranchFilter === 'all' && { backgroundColor: colors.primaryLight },
                ]}
                onPress={() => {
                  setActiveBranchFilter('all');
                  setShowBranchModal(false);
                }}
              >
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={activeBranchFilter === 'all' ? colors.primary : colors.text}
                />
                <Text
                  style={[
                    styles.branchOptionText,
                    {
                      color: activeBranchFilter === 'all' ? colors.primary : colors.text,
                      fontWeight: activeBranchFilter === 'all' ? '700' : '500',
                    },
                  ]}
                >
                  All Branches (Consolidated)
                </Text>
                {activeBranchFilter === 'all' && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>

              {/* Individual branches */}
              {branches.map((b) => {
                const isSelected = activeBranchFilter === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.branchOptionItem,
                      isSelected && { backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => {
                      setActiveBranchFilter(b.id);
                      setShowBranchModal(false);
                    }}
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={isSelected ? colors.primary : colors.text}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.branchOptionText,
                          {
                            color: isSelected ? colors.primary : colors.text,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {b.name}
                      </Text>
                      <Text style={[styles.branchOptionCode, { color: colors.textSecondary }]}>
                        Code: {b.code}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  branchSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    maxWidth: '55%',
  },
  branchSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  branchLockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    maxWidth: '60%',
  },
  branchLockedText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  titleContainer: {
    alignItems: 'flex-end',
    flex: 1,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  screenSubtitle: {
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '75%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CBD5E1',
  },
  modalSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  branchOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  branchOptionText: {
    fontSize: 14,
  },
  branchOptionCode: {
    fontSize: 11,
    marginTop: 2,
  },
  dbStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  dbErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  dbErrorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
  },
  dbErrorSub: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 15,
  },
  dbRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dbRetryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
