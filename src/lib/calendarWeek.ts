export function calendarWeek(reference:Date,weekOffset=0){
 const monday=reference.getDate()-(reference.getDay()+6)%7+weekOffset*7;
 return Array.from({length:7},(_,i)=>new Date(reference.getFullYear(),reference.getMonth(),monday+i,12));
}
