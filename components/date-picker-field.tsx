import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/theme-context';
import { getTodayDDMMYYYY, toDbDate, toDisplayDate } from '@/utils/date';

interface DatePickerFieldProps {
  /** Date string in DD-MM-YYYY or YYYY-MM-DD format */
  value: string;
  /** Callback returning selected date in DD-MM-YYYY format */
  onChange: (ddMmYyyy: string) => void;
  placeholder?: string;
  compact?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePickerField({
  value,
  onChange,
  compact = true,
}: DatePickerFieldProps) {
  const { colors, isDark } = useAppTheme();
  const [modalVisible, setModalVisible] = useState(false);

  // Convert current value to YYYY-MM-DD for HTML <input type="date"> and calendar state
  const dbDateValue = useMemo(() => toDbDate(value), [value]);
  const displayDateValue = useMemo(() => toDisplayDate(value), [value]);

  const initialParts = useMemo(() => {
    const [y, m, d] = dbDateValue.split('-').map(Number);
    const now = new Date();
    return {
      year: y || now.getFullYear(),
      month: m || now.getMonth() + 1, // 1-12
      day: d || now.getDate(),
    };
  }, [dbDateValue]);

  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month); // 1-12

  const openCalendar = () => {
    setViewYear(initialParts.year);
    setViewMonth(initialParts.month);
    setModalVisible(true);
  };

  const shiftMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handleSelectDay = (day: number) => {
    const dd = String(day).padStart(2, '0');
    const mm = String(viewMonth).padStart(2, '0');
    const yyyy = String(viewYear);
    onChange(`${dd}-${mm}-${yyyy}`);
    setModalVisible(false);
  };

  // On Web: Render native <input type="date" /> directly so browser date picker opens natively
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          compact ? styles.compactWrapper : styles.standardWrapper,
          { backgroundColor: colors.inputBg, borderColor: colors.border },
        ]}
      >
        <Ionicons name="calendar-outline" size={15} color={colors.primary} />
        {React.createElement('input', {
          type: 'date',
          value: dbDateValue,
          onChange: (e: any) => {
            const val = e?.target?.value;
            if (val) {
              onChange(toDisplayDate(val));
            }
          },
          style: {
            flex: 1,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: colors.text,
            fontSize: compact ? '12px' : '14px',
            fontWeight: '600',
            fontFamily: 'inherit',
            height: '100%',
            width: '100%',
            cursor: 'pointer',
            colorScheme: isDark ? 'dark' : 'light',
          },
        })}
      </View>
    );
  }

  // On Native (Android / iOS): Render touchable date selector that opens visual Calendar Modal
  return (
    <>
      <TouchableOpacity
        style={[
          compact ? styles.compactWrapper : styles.standardWrapper,
          { backgroundColor: colors.inputBg, borderColor: colors.border },
        ]}
        onPress={openCalendar}
        activeOpacity={0.75}
      >
        <Ionicons name="calendar-outline" size={15} color={colors.primary} />
        <Text
          style={[
            styles.dateText,
            { color: colors.text, fontSize: compact ? 12 : 14 },
          ]}
          numberOfLines={1}
        >
          {displayDateValue}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.calendarCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Header */}
            <View style={styles.calHeader}>
              <Text style={[styles.calTitle, { color: colors.text }]}>
                Select Date
              </Text>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.borderLight }]}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation */}
            <View
              style={[
                styles.monthNav,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
              <TouchableOpacity
                style={styles.navIconBtn}
                onPress={() => shiftMonth(-1)}
              >
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.monthYearLabel, { color: colors.text }]}>
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </Text>
              <TouchableOpacity
                style={styles.navIconBtn}
                onPress={() => shiftMonth(1)}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text
                  key={w}
                  style={[styles.weekdayText, { color: colors.textSecondary }]}
                >
                  {w}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty_${idx}`} style={styles.dayCell} />;
                }
                const isSelected =
                  day === initialParts.day &&
                  viewMonth === initialParts.month &&
                  viewYear === initialParts.year;

                return (
                  <TouchableOpacity
                    key={`day_${day}`}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: isSelected ? '#FFFFFF' : colors.text },
                        isSelected && { fontWeight: '800' },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer Quick Actions */}
            <View style={styles.calFooter}>
              <TouchableOpacity
                style={[
                  styles.todayBtn,
                  { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
                onPress={() => {
                  onChange(getTodayDDMMYYYY());
                  setModalVisible(false);
                }}
              >
                <Ionicons name="today-outline" size={15} color={colors.primary} />
                <Text style={[styles.todayBtnText, { color: colors.primary }]}>
                  Select Today ({getTodayDDMMYYYY()})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    height: 38,
  },
  standardWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  dateText: {
    flex: 1,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 12,
  },
  navIconBtn: {
    padding: 4,
  },
  monthYearLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  calFooter: {
    marginTop: 12,
    alignItems: 'center',
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    width: '100%',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
