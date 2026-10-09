import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/context/auth-context';
import { useAppTheme } from '@/context/theme-context';
import {
  getAttendance,
  getEmployeeMonthlyAttendance,
  getEmployees,
  invalidateQueryCache,
  markAttendance,
  markBatchAttendance,
} from '@/services/api';
import { AttendanceRecord, AttendanceStatus, Employee } from '@/types';
import { toDisplayDate } from '@/utils/date';

const getTodayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AttendanceScreen() {
  const { colors } = useAppTheme();
  const { user, activeBranchFilter, isAdmin } = useAuth();
  const insets = useSafeAreaInsets();

  const todayStr = getTodayString();
  const [currentDate, setCurrentDate] = useState<string>(todayStr);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Calendar Modal State
  const [selectedEmployeeForCalendar, setSelectedEmployeeForCalendar] = useState<Employee | null>(null);
  const [calendarMonthYear, setCalendarMonthYear] = useState<string>(todayStr.substring(0, 7));
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const branchScope = activeBranchFilter === 'all' ? undefined : activeBranchFilter;
      const [emps, att] = await Promise.all([
        getEmployees(branchScope),
        getAttendance(currentDate, branchScope),
      ]);
      setEmployees(emps.filter((e) => e.status !== 'inactive'));
      setAttendanceRecords(att);
    } catch (err) {
      console.warn('Attendance load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [currentDate, activeBranchFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateQueryCache();
    loadData();
  };

  // Date Navigator Helpers - Timezone Safe & Strictly Disallows Future Dates
  const shiftDate = (days: number) => {
    const [y, m, d] = currentDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    const newY = dateObj.getFullYear();
    const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newD = String(dateObj.getDate()).padStart(2, '0');
    const nextDateStr = `${newY}-${newM}-${newD}`;

    if (days > 0 && nextDateStr > todayStr) {
      Alert.alert('Future Date', 'Attendance cannot be marked for future dates.');
      return;
    }
    setCurrentDate(nextDateStr);
  };

  const isToday = currentDate === todayStr;

  // Permission check:
  // - Future dates: locked for everyone
  // - Admin: can edit ANY past date (including today)
  // - Branch Manager: can edit today and up to 7 days in the past
  const checkDateEditable = (dateStr: string): { isEditable: boolean; reason?: string } => {
    if (dateStr > todayStr) {
      return { isEditable: false, reason: 'Attendance cannot be marked for future dates.' };
    }
    if (isAdmin) {
      return { isEditable: true };
    }

    const [cy, cm, cd] = dateStr.split('-').map(Number);
    const targetDate = new Date(cy, cm - 1, cd);
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const todayDate = new Date(ty, tm - 1, td);

    const diffDays = Math.round((todayDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 7) {
      return { isEditable: true };
    }

    return {
      isEditable: false,
      reason: 'Branch managers can only mark or edit attendance for the last 7 days. Older dates are locked (Admin only).',
    };
  };

  const { isEditable, reason: lockedReason } = checkDateEditable(currentDate);

  const getStatus = (employeeId: string): AttendanceStatus | 'unmarked' => {
    const found = attendanceRecords.find((a) => a.employee_id === employeeId);
    return found ? found.status : 'unmarked';
  };

  const handleSetStatus = async (employee: Employee, status: AttendanceStatus) => {
    const check = checkDateEditable(currentDate);
    if (!check.isEditable) {
      Alert.alert('Attendance Locked', check.reason || 'Attendance cannot be edited for this date.');
      return;
    }

    setSavingId(employee.id);

    // Optimistically update local state for snappy UI response
    const existingIdx = attendanceRecords.findIndex((a) => a.employee_id === employee.id);
    let updatedList = [...attendanceRecords];
    if (existingIdx >= 0) {
      updatedList[existingIdx] = {
        ...updatedList[existingIdx],
        status,
        daily_rate: employee.daily_salary,
      };
    } else {
      updatedList.push({
        id: 'temp_' + Date.now(),
        employee_id: employee.id,
        branch_id: employee.branch_id,
        date: currentDate,
        status,
        daily_rate: employee.daily_salary,
        marked_by: user?.username || 'user',
      });
    }
    setAttendanceRecords(updatedList);

    try {
      await markAttendance({
        employee_id: employee.id,
        branch_id: employee.branch_id,
        date: currentDate,
        status,
        daily_rate: employee.daily_salary,
        marked_by: user?.username || 'user',
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save attendance');
      loadData();
    } finally {
      setSavingId(null);
    }
  };

  const handleMarkAllPresent = async () => {
    const check = checkDateEditable(currentDate);
    if (!check.isEditable) {
      Alert.alert('Attendance Locked', check.reason || 'Attendance cannot be edited for this date.');
      return;
    }
    if (employees.length === 0) return;

    Alert.alert(
      'Mark All Present',
      `Mark all ${employees.length} employees as Present for ${toDisplayDate(currentDate)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm All Present',
          onPress: async () => {
            setIsLoading(true);
            const batch = employees.map((emp) => ({
              employee_id: emp.id,
              branch_id: emp.branch_id,
              date: currentDate,
              status: 'present' as AttendanceStatus,
              daily_rate: emp.daily_salary,
              marked_by: user?.username || 'user',
            }));
            await markBatchAttendance(batch);
            await loadData();
          },
        },
      ]
    );
  };

  const loadMonthlyAttendanceForEmployee = async (empId: string, ym: string) => {
    setIsLoadingMonthly(true);
    try {
      const recs = await getEmployeeMonthlyAttendance(empId, ym);
      setMonthlyRecords(recs);
    } catch (err) {
      console.warn('Failed to load monthly attendance:', err);
    } finally {
      setIsLoadingMonthly(false);
    }
  };

  const handleOpenCalendar = (emp: Employee) => {
    const ym = currentDate.substring(0, 7);
    setSelectedEmployeeForCalendar(emp);
    setCalendarMonthYear(ym);
    setSelectedCalendarDate(currentDate);
    loadMonthlyAttendanceForEmployee(emp.id, ym);
  };

  const shiftCalendarMonth = (delta: number) => {
    if (!selectedEmployeeForCalendar) return;
    const [y, m] = calendarMonthYear.split('-').map(Number);
    let newMonth = m + delta;
    let newYear = y;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const newYm = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    setCalendarMonthYear(newYm);
    setSelectedCalendarDate(null);
    loadMonthlyAttendanceForEmployee(selectedEmployeeForCalendar.id, newYm);
  };

  const presentCount = attendanceRecords.filter((a) => a.status === 'present').length;
  const halfDayCount = attendanceRecords.filter((a) => a.status === 'half_day').length;
  const absentCount = attendanceRecords.filter((a) => a.status === 'absent').length;
  const unmarkedCount = Math.max(0, employees.length - (presentCount + halfDayCount + absentCount));

  // Monthly Calendar Calculations
  const [calYear, calMonth] = calendarMonthYear.split('-').map(Number);
  const daysInCalMonth = new Date(calYear, calMonth, 0).getDate();
  const startDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay(); // 0 = Sun
  const calMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const calMonthTitle = `${calMonthNames[calMonth - 1]} ${calYear}`;

  const calPresentCount = monthlyRecords.filter((a) => a.status === 'present').length;
  const calHalfDayCount = monthlyRecords.filter((a) => a.status === 'half_day').length;
  const calAbsentCount = monthlyRecords.filter((a) => a.status === 'absent').length;
  const calTotalEarned = monthlyRecords.reduce((acc, a) => {
    const rate = Number(a.daily_rate) || selectedEmployeeForCalendar?.daily_salary || 0;
    if (a.status === 'present') return acc + rate;
    if (a.status === 'half_day') return acc + rate * 0.5;
    return acc;
  }, 0);

  const selectedDateRecord = selectedCalendarDate
    ? monthlyRecords.find((a) => a.date === selectedCalendarDate)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        title="Daily Attendance"
        subtitle={
          isToday
            ? "Today's Attendance"
            : `${toDisplayDate(currentDate)} • ${
                isEditable ? (isAdmin ? 'Admin Editable' : 'Last 7 Days (Editable)') : 'Locked (Read-Only)'
              }`
        }
      />

      {/* Date Navigator Bar */}
      <View style={[styles.dateBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.dateNavBtn, { backgroundColor: colors.borderLight }]}
          onPress={() => shiftDate(-1)}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.dateCenter}>
          <View style={styles.dateLabelRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={[styles.dateText, { color: colors.text }]}>{toDisplayDate(currentDate)}</Text>
          </View>
          {isToday ? (
            <Text style={[styles.todayBadge, { color: colors.primary }]}>Today (Editable)</Text>
          ) : isEditable ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={[styles.todayBadge, { color: colors.success }]}>
                {isAdmin ? 'Admin Editable' : 'Editable (7-Day Window)'}
              </Text>
              <TouchableOpacity onPress={() => setCurrentDate(todayStr)}>
                <Text style={[styles.jumpTodayText, { color: colors.primary }]}>Today</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={[styles.todayBadge, { color: colors.danger }]}>Locked</Text>
              <TouchableOpacity onPress={() => setCurrentDate(todayStr)}>
                <Text style={[styles.jumpTodayText, { color: colors.primary }]}>Jump to Today</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.dateNavBtn,
            {
              backgroundColor: colors.borderLight,
              opacity: currentDate >= todayStr ? 0.25 : 1,
            },
          ]}
          onPress={() => shiftDate(1)}
          disabled={currentDate >= todayStr}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Status Notice Banner */}
      {!isEditable ? (
        <View style={[styles.readOnlyBanner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
          <Ionicons name="lock-closed" size={16} color={colors.danger} />
          <Text style={[styles.readOnlyText, { color: colors.danger }]}>
            {lockedReason || 'This past attendance record is locked. Contact Admin to make changes.'}
          </Text>
        </View>
      ) : !isToday ? (
        <View style={[styles.readOnlyBanner, { backgroundColor: colors.infoLight, borderColor: colors.info }]}>
          <Ionicons name="create-outline" size={16} color={colors.info} />
          <Text style={[styles.readOnlyText, { color: colors.info }]}>
            {isAdmin
              ? 'Admin Access: You can mark or edit attendance for any past date.'
              : 'Branch Manager Access: You can edit attendance within the last 7 days.'}
          </Text>
        </View>
      ) : null}

      {/* Quick Summary Pill Bar */}
      <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.badgeGroup}>
          <View style={[styles.countBadge, { backgroundColor: colors.successLight }]}>
            <Text style={[styles.countNum, { color: colors.success }]}>{presentCount}</Text>
            <Text style={[styles.countLabel, { color: colors.success }]}>Present</Text>
          </View>

          <View style={[styles.countBadge, { backgroundColor: colors.warningLight }]}>
            <Text style={[styles.countNum, { color: colors.warning }]}>{halfDayCount}</Text>
            <Text style={[styles.countLabel, { color: colors.warning }]}>Half</Text>
          </View>

          <View style={[styles.countBadge, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.countNum, { color: colors.danger }]}>{absentCount}</Text>
            <Text style={[styles.countLabel, { color: colors.danger }]}>Absent</Text>
          </View>

          {unmarkedCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.borderLight }]}>
              <Text style={[styles.countNum, { color: colors.textSecondary }]}>{unmarkedCount}</Text>
              <Text style={[styles.countLabel, { color: colors.textSecondary }]}>Left</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.batchBtn,
            {
              backgroundColor: isEditable ? colors.primary : colors.border,
              opacity: isEditable && employees.length > 0 ? 1 : 0.45,
            },
          ]}
          onPress={handleMarkAllPresent}
          disabled={!isEditable || employees.length === 0}
        >
          <Ionicons name={isEditable ? "checkmark-done" : "lock-closed"} size={15} color="#FFFFFF" />
          <Text style={styles.batchBtnText}>{isEditable ? 'All Present' : 'Locked'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : employees.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Staff Members Found</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              Add employees to this branch first to start recording attendance.
            </Text>
          </View>
        ) : (
          employees.map((emp) => {
            const status = getStatus(emp.id);
            const isRowSaving = savingId === emp.id;

            return (
              <View
                key={emp.id}
                style={[
                  styles.employeeCard,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      status === 'present'
                        ? colors.success
                        : status === 'half_day'
                        ? colors.warning
                        : status === 'absent'
                        ? colors.danger
                        : colors.border,
                  },
                ]}
              >
                {/* Employee Header info (Clickable to view full month calendar) */}
                <TouchableOpacity
                  style={styles.empInfoRow}
                  activeOpacity={0.7}
                  onPress={() => handleOpenCalendar(emp)}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>
                      {emp.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.empName, { color: colors.text }]}>{emp.name}</Text>
                      <Text style={[styles.empCodeBadge, { backgroundColor: colors.borderLight, color: colors.textSecondary }]}>
                        {emp.employee_id_code}
                      </Text>
                    </View>
                    <Text style={[styles.empWageText, { color: colors.textSecondary }]}>
                      ₹{emp.daily_salary}/day • {emp.designation || 'Staff'}
                      {isAdmin && emp.branch_name ? ` • ${emp.branch_name}` : ''}
                    </Text>
                  </View>

                  {isRowSaving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={[styles.calendarBadgeBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                      <Ionicons name="calendar-outline" size={13} color={colors.primary} />
                      <Text style={[styles.calendarBadgeText, { color: colors.primary }]}>Calendar</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Status Switcher Buttons */}
                <View style={[styles.statusButtonsRow, !isEditable && { opacity: 0.55 }]}>
                  {/* PRESENT */}
                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      status === 'present'
                        ? { backgroundColor: colors.success, borderColor: colors.success }
                        : { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                    onPress={() => handleSetStatus(emp, 'present')}
                    disabled={!isEditable || isRowSaving}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={status === 'present' ? '#FFFFFF' : colors.success}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        { color: status === 'present' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      Present
                    </Text>
                  </TouchableOpacity>

                  {/* HALF DAY */}
                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      status === 'half_day'
                        ? { backgroundColor: colors.warning, borderColor: colors.warning }
                        : { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                    onPress={() => handleSetStatus(emp, 'half_day')}
                    disabled={!isEditable || isRowSaving}
                  >
                    <Ionicons
                      name="time"
                      size={16}
                      color={status === 'half_day' ? '#FFFFFF' : colors.warning}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        { color: status === 'half_day' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      Half Day
                    </Text>
                  </TouchableOpacity>

                  {/* ABSENT */}
                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      status === 'absent'
                        ? { backgroundColor: colors.danger, borderColor: colors.danger }
                        : { backgroundColor: colors.inputBg, borderColor: colors.border },
                    ]}
                    onPress={() => handleSetStatus(emp, 'absent')}
                    disabled={!isEditable || isRowSaving}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={status === 'absent' ? '#FFFFFF' : colors.danger}
                    />
                    <Text
                      style={[
                        styles.statusBtnText,
                        { color: status === 'absent' ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      Absent
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── Monthly Attendance Calendar Modal ── */}
      <Modal
        visible={Boolean(selectedEmployeeForCalendar)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedEmployeeForCalendar(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            {/* Modal Header */}
            <View style={[styles.modalTopBar, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.modalEmpName, { color: colors.text }]} numberOfLines={1}>
                    {selectedEmployeeForCalendar?.name}
                  </Text>
                  <View style={[styles.empCodeBadge, { backgroundColor: colors.borderLight }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                      {selectedEmployeeForCalendar?.employee_id_code}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.modalEmpSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  ₹{selectedEmployeeForCalendar?.daily_salary}/day • {selectedEmployeeForCalendar?.designation || 'Staff'}
                  {selectedEmployeeForCalendar?.branch_name ? ` • ${selectedEmployeeForCalendar.branch_name}` : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.modalCloseBtn, { backgroundColor: colors.borderLight }]}
                onPress={() => setSelectedEmployeeForCalendar(null)}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Month Navigator */}
              <View style={[styles.calMonthNav, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.calNavArrow, { backgroundColor: colors.borderLight }]}
                  onPress={() => shiftCalendarMonth(-1)}
                >
                  <Ionicons name="chevron-back" size={16} color={colors.text} />
                </TouchableOpacity>

                <View style={{ alignItems: 'center' }}>
                  <Text style={[styles.calMonthText, { color: colors.text }]}>{calMonthTitle}</Text>
                  <Text style={[styles.calMonthSub, { color: colors.textSecondary }]}>
                    Attendance Calendar
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.calNavArrow, { backgroundColor: colors.borderLight }]}
                  onPress={() => shiftCalendarMonth(1)}
                >
                  <Ionicons name="chevron-forward" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Monthly Stats Strip */}
              <View style={styles.calStatsGrid}>
                <View style={[styles.calStatCard, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.calStatVal, { color: colors.success }]}>{calPresentCount}</Text>
                  <Text style={[styles.calStatLabel, { color: colors.success }]}>Present (Full)</Text>
                </View>
                <View style={[styles.calStatCard, { backgroundColor: colors.warningLight }]}>
                  <Text style={[styles.calStatVal, { color: colors.warning }]}>{calHalfDayCount}</Text>
                  <Text style={[styles.calStatLabel, { color: colors.warning }]}>Half Day (0.5)</Text>
                </View>
                <View style={[styles.calStatCard, { backgroundColor: colors.dangerLight }]}>
                  <Text style={[styles.calStatVal, { color: colors.danger }]}>{calAbsentCount}</Text>
                  <Text style={[styles.calStatLabel, { color: colors.danger }]}>Absent</Text>
                </View>
                <View style={[styles.calStatCard, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.calStatVal, { color: colors.primary }]}>
                    ₹{calTotalEarned.toLocaleString()}
                  </Text>
                  <Text style={[styles.calStatLabel, { color: colors.primary }]}>Earned</Text>
                </View>
              </View>

              {/* Weekday Header */}
              <View style={[styles.weekHeader, { borderBottomColor: colors.border }]}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <Text key={d} style={[styles.weekDayText, { color: colors.textSecondary }]}>
                    {d}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid */}
              {isLoadingMonthly ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <View style={styles.daysGrid}>
                  {/* Empty placeholders before 1st day of month */}
                  {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <View key={`empty-${i}`} style={styles.dayCellPlaceholder} />
                  ))}

                  {/* Day cells 1 to daysInCalMonth */}
                  {Array.from({ length: daysInCalMonth }).map((_, idx) => {
                    const dayNum = idx + 1;
                    const dateStr = `${calendarMonthYear}-${String(dayNum).padStart(2, '0')}`;
                    const rec = monthlyRecords.find((r) => r.date === dateStr);
                    const status = rec?.status;
                    const isTodayCell = dateStr === todayStr;
                    const isFutureCell = dateStr > todayStr;
                    const isSelected = selectedCalendarDate === dateStr;

                    let badgeColor = colors.borderLight;
                    let badgeTextColor = colors.textSecondary;
                    let label = '—';

                    if (status === 'present') {
                      badgeColor = colors.successLight;
                      badgeTextColor = colors.success;
                      label = 'P';
                    } else if (status === 'half_day') {
                      badgeColor = colors.warningLight;
                      badgeTextColor = colors.warning;
                      label = '½';
                    } else if (status === 'absent') {
                      badgeColor = colors.dangerLight;
                      badgeTextColor = colors.danger;
                      label = 'A';
                    } else if (isFutureCell) {
                      label = '';
                    }

                    return (
                      <TouchableOpacity
                        key={dateStr}
                        activeOpacity={0.7}
                        style={[
                          styles.dayCell,
                          {
                            backgroundColor: isSelected
                              ? colors.primaryLight
                              : status === 'present'
                              ? '#f0fdf4'
                              : status === 'half_day'
                              ? '#fffbeb'
                              : status === 'absent'
                              ? '#fef2f2'
                              : colors.card,
                            borderColor: isSelected
                              ? colors.primary
                              : isTodayCell
                              ? colors.primary
                              : colors.borderLight,
                            borderWidth: isSelected ? 2 : isTodayCell ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => setSelectedCalendarDate(dateStr)}
                      >
                        <Text
                          style={[
                            styles.dayNum,
                            {
                              color: isTodayCell
                                ? colors.primary
                                : isFutureCell
                                ? colors.textMuted
                                : colors.text,
                              fontWeight: isTodayCell || isSelected ? '900' : '600',
                            },
                          ]}
                        >
                          {dayNum}
                        </Text>
                        {label ? (
                          <View style={[styles.dayStatusPill, { backgroundColor: badgeColor }]}>
                            <Text style={[styles.dayStatusPillText, { color: badgeTextColor }]}>
                              {label}
                            </Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Selected Day Info Card */}
              {selectedCalendarDate && (
                <View style={[styles.selectedDayBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectedDayDate, { color: colors.text }]}>
                      {toDisplayDate(selectedCalendarDate)} {selectedCalendarDate === todayStr ? '• Today' : ''}
                    </Text>
                    <Text style={[styles.selectedDayStatus, { color: colors.textSecondary }]}>
                      Attendance:{' '}
                      <Text
                        style={{
                          fontWeight: '800',
                          color:
                            selectedDateRecord?.status === 'present'
                              ? colors.success
                              : selectedDateRecord?.status === 'half_day'
                              ? colors.warning
                              : selectedDateRecord?.status === 'absent'
                              ? colors.danger
                              : colors.textSecondary,
                        }}
                      >
                        {selectedDateRecord?.status === 'present'
                          ? 'Present (Full Day • 1.0)'
                          : selectedDateRecord?.status === 'half_day'
                          ? 'Half Day (0.5)'
                          : selectedDateRecord?.status === 'absent'
                          ? 'Absent (0)'
                          : selectedCalendarDate > todayStr
                          ? 'Future Date'
                          : 'Not Marked'}
                      </Text>
                    </Text>
                  </View>

                  {/* Action button to jump to this date on main screen */}
                  {selectedCalendarDate <= todayStr && (
                    <TouchableOpacity
                      style={[styles.jumpBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        const targetDate = selectedCalendarDate;
                        setSelectedEmployeeForCalendar(null);
                        setCurrentDate(targetDate);
                      }}
                    >
                      <Text style={styles.jumpBtnText}>Go to Date</Text>
                      <Ionicons name="arrow-forward" size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Calendar Legend */}
              <View style={[styles.calLegend, { borderTopColor: colors.borderLight }]}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>P = Present</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>½ = Half Day</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>A = Absent</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.borderLight }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>— = Unmarked</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dateNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    alignItems: 'center',
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '800',
  },
  todayBadge: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  jumpTodayText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textDecorationLine: 'underline',
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  badgeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  countNum: {
    fontSize: 13,
    fontWeight: '800',
  },
  countLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  batchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 40 },
  loaderContainer: { paddingVertical: 60, alignItems: 'center' },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  employeeCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  empInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  empName: {
    fontSize: 15,
    fontWeight: '700',
  },
  empCodeBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  empWageText: {
    fontSize: 12,
    marginTop: 2,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  statusBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  calendarBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  calendarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  modalEmpName: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalEmpSub: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  calNavArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthText: {
    fontSize: 15,
    fontWeight: '800',
  },
  calMonthSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  calStatsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  calStatCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calStatVal: {
    fontSize: 15,
    fontWeight: '900',
  },
  calStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    marginBottom: 6,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  dayCellPlaceholder: {
    width: '14.28%',
    height: 54,
  },
  dayCell: {
    width: '14.28%',
    height: 54,
    padding: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayNum: {
    fontSize: 12,
  },
  dayStatusPill: {
    width: '100%',
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  selectedDayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  selectedDayDate: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedDayStatus: {
    fontSize: 12,
    marginTop: 3,
  },
  jumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  jumpBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  calLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
